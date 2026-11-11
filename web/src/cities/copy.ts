// What a city card says besides the name and the flag (spec #20 «Экран», «Карточка города»): the population.
const ONE_DECIMAL = new Intl.NumberFormat('ru', { maximumFractionDigits: 1 });

/** Between the number and «млн» or «тыс.», so that a line never breaks there (#101): «697 тыс.» stays whole. */
const NO_BREAK_SPACE = ' ';

/** «1,7 млн», «1 млн», «250 тыс.»: millions to a tenth, thousands whole. */
function populationText(population: number): string {
	// 999 600 is «1 млн», not «1000 тыс.».
	return population >= 999_500
		? `${ONE_DECIMAL.format(population / 1e6)}${NO_BREAK_SPACE}млн`
		: `${Math.round(population / 1000)}${NO_BREAK_SPACE}тыс.`;
}

/** «Население: 1,7 млн»: the population as a city card and a row of a list say it. */
export function populationLine(population: number): string {
	return `Население: ${populationText(population)}`;
}
