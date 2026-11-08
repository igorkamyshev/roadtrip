// The build report as Markdown (spec «Набор данных», «Отчёт сборки»): what the monthly world build puts in its run's
// summary, for the Owner to add the missing crossings to the border table. In Russian, like the issues.
import type { BuildReport } from './build-graph.ts';

const plural = new Intl.PluralRules('ru');

/** A count with its noun: `forms` are the forms for 1, 2 and 5 (дорога, дороги, дорог). */
function count(value: number, forms: readonly [string, string, string]): string {
	const form = { one: forms[0], few: forms[1] }[plural.select(value) as string] ?? forms[2];
	return `${value.toLocaleString('ru-RU')} ${form}`;
}

export function reportMarkdown(report: BuildReport): string {
	const lines = [
		'## Граф дорог',
		'',
		`${count(report.roadWays, ['дорога', 'дороги', 'дорог'])} OSM, в графе ${count(report.nodes, ['узел', 'узла', 'узлов'])}, ` +
			`${count(report.edges, ['ребро', 'ребра', 'рёбер'])}.`,
		'',
		`Зоны (${report.zones.length}): ${report.zones.join(', ') || 'нет'}. Из них части стран: ${report.parts.join(', ') || 'нет'}.`,
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
