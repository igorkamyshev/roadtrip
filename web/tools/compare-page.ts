// The page of `shots --compare` (tools/shots.ts): its shots before and after side by side, in both themes, the card's
// first, then the screens, for a private artifact with the PNGs as its files (web/README.md, «Demo»). It meets the
// Artifact page's contract: no <html>, <head> or <body>, a <title>, colors as tokens on :root with their dark values
// twice, the body's own background, 16 px at the sides, and it holds at 400 px wide.

export type Theme = 'light' | 'dark';

/** A shot: a link of the demo (its number from 1), a viewport, a theme, and the name its files take. */
export interface Shot {
	readonly link: number;
	readonly path: string;
	readonly width: number;
	readonly height: number;
	readonly theme: Theme;
	readonly name: string;
}

interface ComparePage {
	readonly title: string;
	/** The git ref of «before». */
	readonly ref: string;
	readonly links: readonly string[];
	/** The city of `--card`, whose card was shot too. */
	readonly card: string | undefined;
	readonly shots: readonly Shot[];
}

const THEME_NAMES: Readonly<Record<Theme, string>> = { light: 'светлая', dark: 'тёмная' };

const SIDES = [
	{ prefix: 'before-', caption: 'До' },
	{ prefix: 'after-', caption: 'После' },
] as const;

const STYLE = `<style>
:root {
	--bg: #f3f5f4;
	--surface: #ffffff;
	--fg: #17201d;
	--muted: #5d6a66;
	--line: #d9e0dd;
	--text: system-ui, -apple-system, 'Segoe UI', sans-serif;
}
@media (prefers-color-scheme: dark) {
	:root:not([data-theme="light"]) { --bg: #111615; --surface: #1a2120; --fg: #e8eeec; --muted: #98a6a1; --line: #2a3331; color-scheme: dark; }
}
:root[data-theme="dark"] { --bg: #111615; --surface: #1a2120; --fg: #e8eeec; --muted: #98a6a1; --line: #2a3331; color-scheme: dark; }
body {
	background: var(--bg);
	color: var(--fg);
	font-family: var(--text);
	font-size: 15px;
	line-height: 1.5;
	margin: 0;
	padding-left: max(16px, env(safe-area-inset-left, 0px));
	padding-right: max(16px, env(safe-area-inset-right, 0px));
	padding-block: 24px 48px;
}
main { max-width: 960px; margin: 0 auto; display: grid; gap: 32px; }
h1 { font-size: 24px; margin: 0; text-wrap: balance; }
h2 { font-size: 17px; margin: 0 0 12px; }
p { margin: 0; color: var(--muted); max-width: 65ch; }
code { font-size: 13px; overflow-wrap: anywhere; }
.pair { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
.pair.wide { grid-template-columns: repeat(4, minmax(0, 1fr)); }
figure { margin: 0; display: grid; gap: 6px; min-width: 0; }
figure img { max-width: 100%; width: 100%; height: auto; border-radius: 10px; border: 1px solid var(--line); background: var(--surface); display: block; }
figcaption { font-size: 13px; color: var(--muted); }
figcaption b { color: var(--fg); font-weight: 600; }
@media (max-width: 700px) { .pair.wide { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
</style>`;

function escapeHtml(text: string): string {
	return text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}

/** The section of one link on one viewport: its shots before and after, theme by theme. */
function section(heading: string, shots: readonly Shot[], { suffix, what }: { readonly suffix: string; readonly what: string }): string {
	const figures = shots.flatMap((shot) =>
		SIDES.map(({ prefix, caption }) => {
			const alt = `${caption}, ${THEME_NAMES[shot.theme]} тема: ${what}`;
			return `<figure><img src="${prefix}${shot.name}${suffix}.png" alt="${escapeHtml(alt)}"><figcaption><b>${caption}</b> · ${THEME_NAMES[shot.theme]}</figcaption></figure>`;
		}),
	);
	// The screens of both themes in one row where the page is wide; a card's are wider, a theme a row.
	const wide = suffix === '' && shots.length > 1;
	return `<section><h2>${escapeHtml(heading)}</h2><div class="${wide ? 'pair wide' : 'pair'}">\n${figures.join('\n')}\n</div></section>`;
}

/** The page: the card's sections first, if a card was shot, then the screens', each link on each viewport. */
export function comparePage({ title, ref, links, card, shots }: ComparePage): string {
	const groups = [...Map.groupBy(shots, (shot) => `${shot.link}-${shot.width}x${shot.height}`).values()];
	const where = ([shot]: readonly Shot[]): string => `${shot.width}×${shot.height}${links.length > 1 ? `, ссылка ${shot.link}` : ''}`;
	const cards =
		card === undefined
			? []
			: groups.map((group) => section(`Карточка «${card}», ${where(group)}`, group, { suffix: '-card', what: `карточка «${card}»` }));
	const screens = groups.map((group) => section(`Весь экран, ${where(group)}`, group, { suffix: '', what: 'весь экран' }));
	const linkList = links.map((link, at) => `${links.length > 1 ? `${at + 1}: ` : ''}<code>${escapeHtml(link)}</code>`).join(', ');
	return [
		`<title>${escapeHtml(title)}</title>`,
		'<meta name="claude:viewport-fit-sides" content="cover">',
		STYLE,
		'<main>',
		'<header style="display:grid;gap:8px">',
		`<h1>${escapeHtml(title)}</h1>`,
		`<p>До — <code>${escapeHtml(ref)}</code>, после — рабочая копия. Снято на демо (<code>pnpm --filter web demo</code>), поэтому карта пустая. ${links.length > 1 ? 'Ссылки' : 'Ссылка'}: ${linkList}.</p>`,
		'</header>',
		...cards,
		...screens,
		'</main>',
		'',
	].join('\n');
}
