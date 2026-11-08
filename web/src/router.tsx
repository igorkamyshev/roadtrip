// One route with hash history (decision #18): the whole state of the link lives after `#`, so PostHog's URLs
// never carry the origin and a change writes no page view. `/#/?p=44.81760,20.45730&h=3`.
import { createHashHistory, createRootRouteWithContext, createRoute, createRouter, Navigate } from '@tanstack/react-router';
import { Screen } from './screen/screen.tsx';
import { parseSearch, stringifySearch, validateScreenSearch } from './state/search.ts';
import type { StartupSource } from './state/startup.ts';

/** What the screen knows of the load besides the link. */
export interface ScreenContext {
	/** Where the opening state came from (`startup()`): how its origin, if it has one, was set. */
	readonly opening: StartupSource;
}

const rootRoute = createRootRouteWithContext<ScreenContext>()();

const screenRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: '/',
	validateSearch: validateScreenSearch,
	component: Screen,
});

export function createScreenRouter(context: ScreenContext) {
	return createRouter({
		routeTree: rootRoute.addChildren([screenRoute]),
		context,
		history: createHashHistory(),
		parseSearch,
		stringifySearch,
		// Any other path is the screen with the defaults.
		defaultNotFoundComponent: () => <Navigate to="/" replace />,
	});
}

declare module '@tanstack/react-router' {
	interface Register {
		router: ReturnType<typeof createScreenRouter>;
	}
}
