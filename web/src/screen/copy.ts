// The screen's words that depend on numbers, as in the prototype (variant C).
import { HOURS_PER_DAY, MAX_HOURS } from 'worker/api';

/** The Russian plural of n: forms for 1, 2–4 and 5+ («город», «города», «городов»). */
export function plural(n: number, forms: readonly [one: string, few: string, many: string]): string {
	const ones = n % 10;
	const tens = n % 100;
	if (ones === 1 && tens !== 11) {
		return forms[0];
	}
	return ones >= 2 && ones <= 4 && (tens < 10 || tens >= 20) ? forms[1] : forms[2];
}

// The ring is the slider's cell by its upper bound in hours: N, or HOURS_PER_DAY·D for day D (#83).

/** Whether the slider's cell is a day's. */
export function isDay(hours: number): boolean {
	return hours > MAX_HOURS;
}

/** The ring's span, on the slider's chosen cell: «до 1», «2–3» hours, «1–2» days. */
export function hoursSpan(hours: number): string {
	if (isDay(hours)) {
		const day = hours / HOURS_PER_DAY;
		return `${day - 1}–${day}`;
	}
	return hours === 1 ? 'до 1' : `${hours - 1}–${hours}`;
}

/** The word after a span of days, by its last: «дня», «дней». */
export function daysWord(hours: number): string {
	return plural(hours / HOURS_PER_DAY, ['день', 'дня', 'дней']);
}

/** The ring in short: «до 1 ч», «2–3 ч», «1–2 дня». */
export function hoursShort(hours: number): string {
	return isDay(hours) ? `${hoursSpan(hours)} ${daysWord(hours)}` : `${hoursSpan(hours)} ч`;
}

/** The ring in the phrase: «до 1 часа», «2–3 часа», «5–6 часов», «4–5 дней». */
export function hoursLong(hours: number): string {
	if (isDay(hours)) {
		return hoursShort(hours);
	}
	return hours === 1 ? 'до 1 часа' : `${hours - 1}–${hours} ${plural(hours, ['час', 'часа', 'часов'])}`;
}
