// The screen's words that depend on numbers, as in the prototype (variant C).

/** The Russian plural of n: forms for 1, 2–4 and 5+ («город», «города», «городов»). */
export function plural(n: number, forms: readonly [one: string, few: string, many: string]): string {
	const ones = n % 10;
	const tens = n % 100;
	if (ones === 1 && tens !== 11) {
		return forms[0];
	}
	return ones >= 2 && ones <= 4 && (tens < 10 || tens >= 20) ? forms[1] : forms[2];
}

/** The ring's hours as a span, on the slider's chosen cell: «до 1», «2–3». */
export function hoursSpan(hours: number): string {
	return hours === 1 ? 'до 1' : `${hours - 1}–${hours}`;
}

/** The ring's hours in short: «до 1 ч», «2–3 ч». */
export function hoursShort(hours: number): string {
	return `${hoursSpan(hours)} ч`;
}

/** The ring's hours in the phrase: «до 1 часа», «2–3 часа», «5–6 часов». */
export function hoursLong(hours: number): string {
	return hours === 1 ? 'до 1 часа' : `${hours - 1}–${hours} ${plural(hours, ['час', 'часа', 'часов'])}`;
}
