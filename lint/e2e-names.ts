// A locator or a reading that more than one screen test needs lives in web/e2e/screen.ts (web/README.md, «Tests»), and
// test data they share in web/e2e/fixtures.ts. So no two specs declare one top-level function or constant, and no spec
// declares one a shared module of web/e2e has: a short copy of a helper is under what fallow's dupes catch (#116).
//
//   node lint/e2e-names.ts   exit 1 and print each name declared twice
import { globSync, readFileSync } from 'node:fs';
import ts from 'typescript';

const E2E = 'web/e2e';
const SPEC = /\.spec\.ts$/u;

/** The names a binding declares: `a`, and those of `{ a, b: c }` and `[a, ...d]`. */
function boundNames(name: ts.BindingName): string[] {
	if (ts.isIdentifier(name)) {
		return [name.text];
	}
	return name.elements.flatMap((element) => (ts.isBindingElement(element) ? boundNames(element.name) : []));
}

/** The functions, constants and classes a module declares at its top level. */
function topLevelNames(path: string, text: string): string[] {
	const source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, false, ts.ScriptKind.TS);
	return source.statements.flatMap((statement) => {
		if (ts.isVariableStatement(statement)) {
			return statement.declarationList.declarations.flatMap((declaration) => boundNames(declaration.name));
		}
		if ((ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement)) && statement.name !== undefined) {
			return [statement.name.text];
		}
		return [];
	});
}

/**
 * What is declared twice in the screen tests `files` (each module of web/e2e by its path, with its text): a top-level
 * name in two specs, or in a spec and a shared module (any other module of web/e2e).
 */
export function sharedNames(files: Readonly<Record<string, string>>): string[] {
	const where = new Map<string, string[]>();
	for (const [path, text] of Object.entries(files)) {
		for (const name of new Set(topLevelNames(path, text))) {
			where.set(name, [...(where.get(name) ?? []), path]);
		}
	}
	return [...where]
		.filter(([, paths]) => paths.length > 1 && paths.some((path) => SPEC.test(path)))
		.toSorted(([a], [b]) => a.localeCompare(b, 'en'))
		.map(([name, paths]) => {
			const sorted = paths.toSorted();
			const shared = sorted.filter((path) => !SPEC.test(path));
			const fix =
				shared.length === 0
					? `move it to ${E2E}/screen.ts or ${E2E}/fixtures.ts if it is one thing, or give each a name that tells them apart`
					: `use the one in ${shared.join(' or ')}, or give this one a name that tells them apart`;
			return `${name} is declared in ${sorted.join(' and ')}: ${fix}`;
		});
}

if (process.argv[1].endsWith('e2e-names.ts')) {
	const modules = globSync(`${E2E}/*.ts`).map((path): [string, string] => [path, readFileSync(path, 'utf8')]);
	const problems = sharedNames(Object.fromEntries(modules));
	process.stderr.write(problems.map((problem) => `e2e-names: ${problem}\n`).join(''));
	process.exitCode = problems.length > 0 ? 1 : 0;
}
