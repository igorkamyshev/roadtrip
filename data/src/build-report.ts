// The build report as Markdown (spec #20 «Набор данных», «Отчёт сборки»): what the monthly world build puts in its
// run's summary, for the Owner to add the missing crossings to the border table. In Russian, like the issues.
import type { BuildReport } from './build-graph.ts';
import type { CitiesReport } from './cities.ts';
import { MAX_ACCESS_METERS, MAX_SQUARE_KM, MIN_SITELINKS, type PlacesReport } from './places.ts';
import { PLACE_DOUBTS, type PlaceDoubt } from './wikidata.ts';

const plural = new Intl.PluralRules('ru');

/** A count with its noun: `forms` are the forms for 1, 2 and 5 (дорога, дороги, дорог). */
function count(value: number, forms: readonly [string, string, string]): string {
	const form = { one: forms[0], few: forms[1] }[plural.select(value) as string] ?? forms[2];
	return `${value.toLocaleString('ru-RU')} ${form}`;
}

/** The codes one after another, or «нет» for none. */
function listOrNone(codes: readonly string[]): string {
	return codes.length > 0 ? codes.join(', ') : 'нет';
}

export function reportMarkdown(report: BuildReport): string {
	const lines = [
		'## Граф дорог',
		'',
		`${count(report.roadWays, ['дорога', 'дороги', 'дорог'])} OSM, в графе ${count(report.nodes, ['узел', 'узла', 'узлов'])}, ` +
			`${count(report.edges, ['ребро', 'ребра', 'рёбер'])}.`,
		'',
		`Зоны (${report.zones.length}): ${listOrNone(report.zones)}. Из них части стран: ${listOrNone(report.parts)}.`,
	];
	if (report.partialZones.length > 0) {
		lines.push('', `Зоны без колец, которые выгрузка держит не целиком: ${report.partialZones.join(', ')}.`);
	}
	if (report.incompleteZones.length > 0) {
		lines.push(
			'',
			`Выгрузка не держит целиком ни одного кольца этих зон, кроме дыр, поэтому их нет и у их дорог нет зоны: ${report.incompleteZones.join(', ')}.`,
		);
	}
	const { pairsWithoutCrossings, crossingsNotFound } = report.borders;
	lines.push(
		'',
		'### Пары с паспортным контролем без пунктов пропуска',
		'',
		'Дороги пересекают границу пары, но рядом ни с одной нет `barrier=border_control` в OSM и открытого пункта в таблице границ, ' +
			'поэтому машина через неё не проедет. Добавьте пункты пропуска пары в таблицу границ (`rules/src/border-table.ts`).',
		'',
	);
	if (pairsWithoutCrossings.length === 0) {
		lines.push('Нет.');
	} else {
		lines.push(
			'| Пара | Рёбер через границу |',
			'| --- | --- |',
			...pairsWithoutCrossings.map(({ pair, edges }) => `| ${pair} | ${edges} |`),
		);
	}
	lines.push(
		'',
		'### Открытые пункты таблицы без дороги через границу рядом',
		'',
		'Неверные координаты или пункт, где в OSM нет дороги для машин.',
		'',
		crossingsNotFound.length === 0 ? 'Нет.' : crossingsNotFound.map((id) => `- ${id}`).join('\n'),
		'',
	);
	return lines.join('\n');
}

/** The cities file's part of the report: the places left out as parts of a city (GLOSSARY «Часть города»). */
export function cityPartsMarkdown({ cityParts, biggestCityParts }: CitiesReport): string {
	const lines = [
		'## Части города',
		'',
		`Мест, которые стали частями города и не вошли в файл городов: ${cityParts.toLocaleString('ru-RU')}.`,
	];
	if (biggestCityParts.length > 0) {
		lines.push(
			'',
			biggestCityParts.length < cityParts ? `${biggestCityParts.length} самых больших:` : 'Все они:',
			'',
			'| Место | Жителей | Город | Расстояние, км |',
			'| --- | --- | --- | --- |',
			...biggestCityParts.map(
				({ id, name, population, city, km }) =>
					`| ${name} (${id}) | ${population.toLocaleString('ru-RU')} | ${city} | ${km.toLocaleString('ru-RU')} |`,
			),
		);
	}
	lines.push('');
	return lines.join('\n');
}

/** Bytes as megabytes in Russian, to 0.01: «0,58». */
const megabytes = (bytes: number) => (bytes / 1e6).toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** The words of the doubts of a place's item in the report. */
const DOUBT_WORDS: Readonly<Record<PlaceDoubt, string>> = {
	class: 'класс',
	disambiguation: 'страница неоднозначности',
	settlement: 'селение',
};

/**
 * The places in doubt that the table of exclusions of places has no word on: the places to decide on in it
 * (data/AGENTS.md, «Places file»), the most famous with their type and Wikidata's classes.
 */
function undecidedMarkdown({ count: undecided, byDoubt, mostFamous }: PlacesReport['undecided']): string {
	const doubts = PLACE_DOUBTS.map((doubt) => `${DOUBT_WORDS[doubt]} — ${byDoubt[doubt].toLocaleString('ru-RU')}`).join(', ');
	const line = `Кандидатов в исключения без решения в таблице \`data/place-exclusions.tsv\`: ${undecided.toLocaleString('ru-RU')} (${doubts}).`;
	const examples = mostFamous
		.map(
			({ qid, name, type, instanceOf }) =>
				`${name === '' ? '' : `${name} `}(Q${qid}, ${type}, P31: ${instanceOf.length === 0 ? 'нет' : instanceOf.join(', ')})`,
		)
		.join(', ');
	return mostFamous.length > 0 ? `${line} Самые известные: ${examples}.` : line;
}

/**
 * The places file's part of the report (spec #154 «Сборка мест»): how many places, what was left out, the size, the
 * cells of the outlines, the places without a Russian name that the table of Russian names of places lacks, the
 * places to add to it, and the places in doubt that the table of exclusions has no word on (data/AGENTS.md, «Places
 * file»).
 */
export function placesMarkdown(report: PlacesReport, brotliBytes: number, budgetBytes: number): string {
	const { withoutRussian } = report;
	const line = `Мест без русского названия, которых нет в таблице \`data/place-russian-names.tsv\`: ${withoutRussian.count.toLocaleString('ru-RU')}.`;
	const examples = withoutRussian.mostFamous.map(({ qid, name }) => (name === '' ? `Q${qid}` : `${name} (Q${qid})`)).join(', ');
	return [
		'## Места',
		'',
		`В файле мест ${count(report.places, ['место', 'места', 'мест'])}, ${megabytes(brotliBytes)} МБ в brotli при бюджете ` +
			`${(budgetBytes / 1e6).toLocaleString('ru-RU')} МБ.`,
		'',
		`Не вошли: меньше ${MIN_SITELINKS} сайтлинков — ${report.belowSitelinks}, без целого контура — ${report.withoutOutline}, ` +
			`больше ${MAX_SQUARE_KM} км² — ${report.tooLarge}, в пределах города — ${report.inCities}, ` +
			`без дороги ближе ${MAX_ACCESS_METERS / 1000} км — ${report.withoutAccess}, храмы, которые Wikidata не называет монастырём, — ${report.notMonasteries}, ` +
			`убраны таблицей исключений — ${report.excluded}.`,
		'',
		`Клеток контуров: ${report.cells.count.toLocaleString('ru-RU')}, в них ${count(report.cells.outlines, ['место', 'места', 'мест'])} контуром ` +
			`и ${count(report.cells.radii, ['место', 'места', 'мест'])} радиусом, ${megabytes(report.cells.bytes)} МБ.`,
		'',
		withoutRussian.mostFamous.length > 0 ? `${line} Самые известные: ${examples}.` : line,
		'',
		undecidedMarkdown(report.undecided),
		'',
	].join('\n');
}

/**
 * The cities without a Russian name that the table of Russian names lacks, which the screen shows in their local
 * names: the cities to add to the table (data/AGENTS.md, «Cities file»).
 */
export function missingRussianNamesMarkdown({ missingRussianNames: { count: missing, biggest } }: CitiesReport): string {
	const line = `Городов без русского названия, которых нет в таблице \`data/russian-names.tsv\`: ${missing.toLocaleString('ru-RU')}.`;
	const examples = biggest.map(({ id, name }) => `${name} (${id})`).join(', ');
	return ['## Русские названия', '', biggest.length > 0 ? `${line} Самые большие: ${examples}.` : line, ''].join('\n');
}

/**
 * Where a version's places came from when their job failed (src/publish.ts): the version before it (`version`), or
 * nowhere, the version before (`previous`, if any) having none either.
 */
export type FailedPlacesOrigin =
	| { readonly from: 'previous'; readonly version: string }
	| { readonly from: 'none'; readonly previous: string | undefined };

/** The build report's section on the places when their job failed: where the version's places came from. */
export function placesFailedMarkdown(places: FailedPlacesOrigin): string {
	let what: string;
	if (places.from === 'previous') {
		what = `файл мест и клетки контуров — из прошлой версии ${places.version}.`;
	} else if (places.previous === undefined) {
		what = 'прошлой версии набора нет, так что он выложен без мест.';
	} else {
		what = `в прошлой версии ${places.previous} мест нет, так что набор выложен без мест.`;
	}
	return ['## Места', '', `Джоба мест упала: ${what}`, ''].join('\n');
}
