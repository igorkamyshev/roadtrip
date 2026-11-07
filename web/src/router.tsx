// One route with hash history (decision #18): the whole state of the link lives after `#`, so PostHog's URLs
// never carry the origin and a change writes no page view. `/#/?p=44.81760,20.45730&h=3`.
import { createHashHistory, createRootRoute, createRoute, createRouter, Navigate } from '@tanstack/react-router';
import { Screen } from './screen/screen.tsx';
import { parseSearch, stringifySearch, validateScreenSearch } from './state/search.ts';

const rootRoute = createRootRoute();

const screenRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: '/',
	validateSearch: validateScreenSearch,
	component: Screen,
});

export function createScreenRouter() {
	return createRouter({
		routeTree: rootRoute.addChildren([screenRoute]),
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
