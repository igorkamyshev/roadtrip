// The report of the comparison, in Russian like the PR it goes into: a table per start point.
import { ENGINE_VERSION } from 'engine';
import { CLASS_SPEED_KMH } from '../roads.ts';
import { type CityMedians, TOLERANCE, type Verdict } from './metrics.ts';
import type { StartPoint } from './places.ts';

export interface RingComparison {
	readonly hours: number;
	readonly oursKm2: number;
	readonly valhallaKm2: number;
	/** `empty`: the extract ends before N − 1 hours for both engines. */
	readonly area: Verdict & { readonly empty: boolean };
	/** Undefined when neither engine reaches a city within N hours. */
	readonly cities: CityMedians | undefined;
	readonly median: Verdict | undefined;
}

export interface PointComparison {
	readonly point: StartPoint;
	readonly rings: readonly RingComparison[];
}

export function fits(point: PointComparison): boolean {
	return point.rings.every((ring) => ring.area.fits && (ring.median?.fits ?? true));
}

export function report(points: readonly PointComparison[], notes: string): string {
	const fitting = points.filter(fits).length;
	const lines = [
		'# Сверка движка с Valhalla',
		'',
		`Версия движка ${ENGINE_VERSION}. Скорости, км/ч: ${Object.entries(CLASS_SPEED_KMH)
			.map(([highway, kmh]) => `${highway} ${kmh}`)
			.join(', ')}.`,
		'',
		notes,
		'',
		`**В допуск ±${TOLERANCE * 100} % укладываются ${fitting} из ${points.length} точек.**`,
		'',
		'| Точка | Регион | 1 ч | 3 ч | 6 ч | 12 ч |',
		'|---|---|---|---|---|---|',
		...points.map(
			(point) =>
				`| ${point.point.name} | ${point.point.region} | ${point.rings.map((ring) => `${ring.area.empty ? 'пусто' : percent(ring.area.deviation)} / ${ring.median === undefined ? '—' : percent(ring.median.deviation)}${ring.area.fits && (ring.median?.fits ?? true) ? '' : ' ✗'}`).join(' | ')} |`,
		),
		'',
		'В сводной таблице: отклонение площади кольца / отклонение медианы времени до городов, наше против Valhalla. ✗ — вне допуска. «пусто» — выгрузка кончается раньше N−1 ч у обоих движков, кольца нет.',
	];
	for (const point of points) {
		lines.push(
			'',
			`## ${point.point.name} (${point.point.lat}, ${point.point.lon}), регион ${point.point.region}${fits(point) ? '' : ' — вне допуска'}`,
			'',
			'| N | Площадь кольца, км²: наша | Valhalla | Δ | Городов за N ч | Медиана времени, ч: наша | Valhalla | Δ |',
			'|---|---|---|---|---|---|---|---|',
			...point.rings.map(
				(ring) =>
					`| ${ring.hours} ч | ${km2(ring.oursKm2)} | ${km2(ring.valhallaKm2)} | ${ring.area.empty ? 'пусто' : mark(ring.area)} | ${ring.cities?.cities ?? 0} | ${hours(ring.cities?.ours)} | ${hours(ring.cities?.valhalla)} | ${ring.median === undefined ? '—' : mark(ring.median)} |`,
			),
		);
	}
	return `${lines.join('\n')}\n`;
}

function mark(verdict: Verdict): string {
	return verdict.fits ? percent(verdict.deviation) : `**${percent(verdict.deviation)}** ✗`;
}

function percent(deviation: number): string {
	if (!Number.isFinite(deviation)) {
		return deviation > 0 ? '+∞' : '−∞';
	}
	const value = Math.round(deviation * 100);
	return `${value > 0 ? '+' : value < 0 ? '−' : '±'}${Math.abs(value)} %`;
}

function km2(value: number): string {
	return Math.round(value).toLocaleString('ru-RU');
}

function hours(value: number | undefined): string {
	return value === undefined ? '—' : Number.isFinite(value) ? value.toFixed(2).replace('.', ',') : '∞';
}
