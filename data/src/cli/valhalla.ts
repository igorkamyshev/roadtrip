// The comparison of our engine with Valhalla on the full graph (#24; spec #20 «Решения по тестам», «Сверка с
// Valhalla»). A one-off check, not a CI test:
//
//   pnpm --filter data valhalla <work dir> [--report <file.md>] [--regions <id,…>] [--mirror <url>]
//     [--port <Valhalla's port>]
//
// For each region of src/valhalla/places.ts (src/valhalla/region.ts) it downloads the extracts into the work
// directory, has Valhalla compute the rings of 1, 3, 6 and 12 h and the travel times to cities from each start point
// (kept in <work>/valhalla/, so a later run only recomputes ours: src/valhalla/theirs.ts), then computes the same with
// our engine and writes the report. Needs osmium-tool, unzip and Valhalla's commands on PATH (`pip install pyvalhalla`
// in an activated venv). Valhalla's tiles are deleted once a region's start points are done; the region's extracts
// stay for the next run. A region of a few countries takes ~10 GB of memory while Valhalla builds its tiles.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { loadCities } from '../valhalla/cities.ts';
import { REGIONS } from '../valhalla/places.ts';
import type { Tools } from '../valhalla/prepare.ts';
import { compareRegion } from '../valhalla/region.ts';
import { type PointComparison, report } from '../valhalla/report.ts';
import { log, userPath } from './input.ts';

const { values, positionals } = parseArgs({
	allowPositionals: true,
	options: {
		report: { type: 'string' },
		regions: { type: 'string' },
		mirror: { type: 'string', default: 'https://download.geofabrik.de' },
		port: { type: 'string', default: '8902' },
	},
});
const workArgument = positionals.at(0);
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

const comparisons: PointComparison[] = [];
for (const region of REGIONS.filter((one) => regionIds.includes(one.id))) {
	comparisons.push(...(await compareRegion(region, { work, cities, tools })));
}

const markdown = report(comparisons, readNotes());
if (values.report === undefined) {
	process.stdout.write(markdown);
} else {
	writeFileSync(userPath(values.report), markdown);
	log(`wrote ${values.report}`);
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
