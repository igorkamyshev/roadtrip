// The comparison of our engine with Valhalla on the full graph (#24; spec «Решения по тестам», «Сверка с
// Valhalla»). A one-off check, not a CI test:
//
//   pnpm --filter data valhalla <work dir> [--report <file.md>] [--regions <id,…>] [--mirror <url>]
//     [--port <Valhalla's port>]
//
// For each region of src/valhalla/places.ts it downloads the extracts into the work directory, has Valhalla
// compute the rings of 1, 3, 6 and 12 h and the travel times to cities from each start point (kept in
// <work>/valhalla/, so a later run only recomputes ours), then computes the same with our engine and writes the
// report. Needs osmium-tool, unzip and Valhalla's commands on PATH (`pip install pyvalhalla` in an activated
// venv). Valhalla's tiles are deleted once a region's start points are done; the region's extracts stay for the
// next run. A region of a few countries takes ~10 GB of memory while Valhalla builds its tiles.
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import type { MultiPolygon } from 'engine';
import { haversineMeters } from 'engine/geo';
import type { Graph } from 'engine/graph';
import { type City, loadCities } from '../valhalla/cities.ts';
import { areaKm2, cityMedians, envelopeKm2, type RingArea, ringVerdict, verdict } from '../valhalla/metrics.ts';
import { graphWithoutZones, ourReach, ourRing, RoadIndex } from '../valhalla/ours.ts';
import { REGIONS, START_POINTS, type StartPoint } from '../valhalla/places.ts';
import { prepareRoads, prepareValhalla, type Tools } from '../valhalla/prepare.ts';
import { type PointComparison, report } from '../valhalla/report.ts';
import { withValhalla } from '../valhalla/valhalla.ts';
import { log, seconds, userPath } from './input.ts';

const RING_HOURS = [1, 3, 6, 12];
/** A city further than this from the origin is out of any 12 h ring. */
const CITY_REACH_METERS = 1_500_000;
/** A city further than this from a road of our graph is outside the extract. */
const CITY_ROAD_METERS = 5000;
/** Our times to cities are counted up to this, so that a city Valhalla reaches in 12 h has ours too. */
const OUR_LIMIT_HOURS = 15;

const { values, positionals } = parseArgs({
	allowPositionals: true,
	options: {
		report: { type: 'string' },
		regions: { type: 'string' },
		mirror: { type: 'string', default: 'https://download.geofabrik.de' },
		port: { type: 'string', default: '8902' },
	},
});
const [workArgument] = positionals;
if (workArgument === undefined) {
	log('usage: pnpm --filter data valhalla <work dir> [--report <file.md>] [--regions <id,…>] [--mirror <url>] [--port <port>]');
	process.exit(2);
}
const work = userPath(workArgument);
const tools: Tools = {
	extractBase: values.mirror,
	valhallaPort: Number(values.port),
	log,
};
mkdirSync(join(work, 'valhalla'), { recursive: true });
const cities = await loadCities(work);
const regionIds = values.regions?.split(',') ?? REGIONS.map((region) => region.id);

/**
 * What Valhalla gave for a start point, kept in the work directory: the cities with its travel times here, and
 * its contours of each ring in `<point>-<N>.geojson` (the contour of N − 1 hours, if any, then that of N).
 */
interface ValhallaResult {
	readonly cities: readonly (City & { readonly hours: number | null })[];
}

const comparisons: PointComparison[] = [];
for (const region of REGIONS.filter((one) => regionIds.includes(one.id))) {
	const started = performance.now();
	const files = await prepareRoads(work, region, tools);
	const graph = graphWithoutZones(files.roads);
	const index = new RoadIndex(graph, CITY_ROAD_METERS);
	log(`${region.id}: our graph of ${graph.nodeLat.length} nodes in ${seconds(started)}`);
	const points = START_POINTS.filter((point) => point.region === region.id);
	const resultPath = (point: StartPoint) => join(work, 'valhalla', `${point.id}.json`);
	const missing = points.filter((point) => !existsSync(resultPath(point)));
	if (missing.length > 0) {
		prepareValhalla(files, tools);
		await withValhalla(files, tools, async (service) => {
			for (const point of missing) {
				const pointStarted = performance.now();
				for (const hours of RING_HOURS) {
					const minutes = hours === 1 ? [50] : [50 * (hours - 1), 50 * hours];
					const contours = await service.isochrones(point, minutes);
					writeFileSync(contourPath(point, hours), featureCollection(contours));
				}
				const candidates = cities.filter(
					(city) =>
						haversineMeters(point.lat, point.lon, city.lat, city.lon) <= CITY_REACH_METERS && index.nearest(city.lat, city.lon) !== undefined,
				);
				const hours = await service.travelHours(point, candidates);
				const result: ValhallaResult = {
					cities: candidates.map((city, at) => ({ ...city, hours: Number.isFinite(hours[at]) ? hours[at] : null })),
				};
				writeFileSync(resultPath(point), JSON.stringify(result));
				log(`${point.id}: Valhalla in ${seconds(pointStarted)}, ${candidates.length} cities`);
			}
		});
		rmSync(files.tiles, { recursive: true, force: true });
	}
	for (const point of points) {
		const pointStarted = performance.now();
		const valhalla = JSON.parse(readFileSync(resultPath(point), 'utf8')) as ValhallaResult;
		const reach = ourReach(graph, index, point, OUR_LIMIT_HOURS);
		if (reach === undefined) {
			throw new Error(`${point.id}: no road of our graph within 50 km`);
		}
		checkSameAsComputeRing(graph, point, reach.isochrone(1));
		const ours = reach.travelHours(valhalla.cities);
		const cityTimes = valhalla.cities.map((city, at) => ({ ours: ours[at], valhalla: city.hours ?? Infinity }));
		const rings = RING_HOURS.map((hours) => {
			const isochrones = (hours === 1 ? [1] : [hours - 1, hours]).map((within) => reach.isochrone(within));
			writeFileSync(join(work, 'valhalla', `${point.id}-${hours}-ours.geojson`), featureCollection(isochrones));
			const ours = ringArea(isochrones);
			const valhallaRing = ringArea(readContours(contourPath(point, hours)));
			const medians = cityMedians(cityTimes, hours);
			return {
				hours,
				oursKm2: ours.ringKm2,
				valhallaKm2: valhallaRing.ringKm2,
				area: ringVerdict(ours, valhallaRing),
				cities: medians,
				median: medians === undefined ? undefined : verdict(medians.ours, medians.valhalla),
			};
		});
		comparisons.push({ point, rings });
		log(
			`${point.id} (${seconds(pointStarted)}): ` +
				rings.map((ring) => `${ring.hours} h area ${pct(ring.area.deviation)} median ${ring.median === undefined ? '—' : pct(ring.median.deviation)}`).join('; '),
		);
	}
}

const notes = readNotes();
const markdown = report(comparisons, notes);
if (values.report === undefined) {
	process.stdout.write(markdown);
} else {
	writeFileSync(userPath(values.report), markdown);
	log(`wrote ${values.report}`);
}

function contourPath(point: StartPoint, hours: number): string {
	return join(work, 'valhalla', `${point.id}-${hours}.geojson`);
}

function readContours(path: string): MultiPolygon[] {
	return (JSON.parse(readFileSync(path, 'utf8')) as { features: { geometry: MultiPolygon }[] }).features.map((feature) => feature.geometry);
}

/** The ring's area by envelopes, that of N hours less that of N − 1, from the contours of N − 1 (if any) and N. */
function ringArea(contours: readonly MultiPolygon[]): RingArea {
	const [inner, outer] = contours.length === 1 ? [undefined, contours[0]] : contours;
	const envelope = envelopeKm2(outer);
	return { ringKm2: envelope - (inner === undefined ? 0 : envelopeKm2(inner)), envelopeKm2: envelope };
}

/** Our isochrones start as computeRing starts: the 1 h one is the engine's ring of (0, 1] itself. */
function checkSameAsComputeRing(graph: Graph, point: StartPoint, isochrone: MultiPolygon): void {
	const ring = ourRing(graph, point, 1);
	const [ringKm2, isochroneKm2] = [ring === undefined ? 0 : areaKm2(ring), areaKm2(isochrone)];
	if (Math.abs(ringKm2 - isochroneKm2) > 1e-6 * Math.max(1, ringKm2)) {
		throw new Error(`${point.id}: our 1 h isochrone (${isochroneKm2} km²) is not computeRing's ring (${ringKm2} km²)`);
	}
}

function featureCollection(geometries: readonly unknown[]): string {
	return JSON.stringify({ type: 'FeatureCollection', features: geometries.map((geometry) => ({ type: 'Feature', geometry, properties: {} })) });
}

function pct(deviation: number): string {
	return `${(deviation * 100).toFixed(0)}%`;
}

/** The method, for the report's header. */
function readNotes(): string {
	return [
		`Прогон ${new Date().toISOString().slice(0, 10)}, выгрузки OSM с ${values.mirror} (пути Geofabrik) и из \`src/valhalla/places.ts\`. ` +
			'Оба движка считают по одним и тем же выгрузкам, без правил границ: все страны открыты, времени на границе нет. Наш граф строится без зон, тайлы Valhalla — без admin-базы. Выгрузка региона — страна с соседями; кольцо, которое она обрезает, обрезано у обоих движков одинаково.',
		'**Valhalla** — полный граф: все дороги, по которым можно ехать на машине, с запретами поворотов, без паромов; costing `auto` как есть. Её время за рулём умножено на 1,2, как наше: кольцо N ч лежит между контурами на 50·(N−1) и 50·N мин за рулём.',
		'**Площадь кольца** — разность площадей внутри внешних контуров N и N−1 ч, без дыр, у обоих движков. Valhalla красит только ячейки ~500 м, через которые идут дороги, поэтому дыры её контуров — земля между дорогами, а не недоезд; так же мерили площади в research/cloudflare-routing, когда выбирали допуск ±10 %. Наши контуры — те же, что рисует движок (`ringContour`). Кольцо меньше 2 % своей площади N ч у обоих движков — «пусто»: выгрузка кончается раньше N−1 ч.',
		'**Медиана времени до городов** — по городам GeoNames от 15 000 жителей, до которых хотя бы один движок доезжает за N ч; у каждого движка своё время. У Valhalla — матрица от точки старта до городов. У нас — Дейкстра движка до ближайшей достигнутой дороги плюс путь по прямой на 30 км/ч, как в кольце.',
	].join('\n\n');
}
