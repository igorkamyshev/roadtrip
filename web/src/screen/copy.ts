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

// PROTOTYPE (#77): a step of the scale over 12 is day D = step − 11, the ring from D − 1 to D days.

/** Hours up to 12; above, the scale's day D: 13 is 2 days. */
export function dayOfStep(step: number): number | undefined {
	return step > 12 ? step - 11 : undefined;
}

/** The ring's hours as a span, on the slider's chosen cell: «до 1», «2–3»; a day «1–2 дн». */
export function hoursSpan(hours: number): string {
	const day = dayOfStep(hours);
	if (day !== undefined) {
		return `${day - 1}–${day} дн`;
	}
	return hours === 1 ? 'до 1' : `${hours - 1}–${hours}`;
}

/** The ring's hours in short: «до 1 ч», «2–3 ч»; a day «1–2 дня». */
export function hoursShort(hours: number): string {
	const day = dayOfStep(hours);
	return day === undefined ? `${hoursSpan(hours)} ч` : `${day - 1}–${day} ${plural(day, ['дня', 'дня', 'дней'])}`;
}

/** The ring's hours in the phrase: «до 1 часа», «2–3 часа», «5–6 часов»; a day «1–2 дня», «4–5 дней». */
export function hoursLong(hours: number): string {
	const day = dayOfStep(hours);
	if (day !== undefined) {
		return hoursShort(hours);
	}
	return hours === 1 ? 'до 1 часа' : `${hours - 1}–${hours} ${plural(hours, ['час', 'часа', 'часов'])}`;
}
