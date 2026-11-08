// The client's entry: the opening state (link, then saved, then defaults), then the screen.
import '@fontsource/golos-text/400.css';
import '@fontsource/golos-text/500.css';
import '@fontsource/golos-text/600.css';
import '@fontsource/golos-text/700.css';
import '@fontsource/unbounded/500.css';
import '@fontsource/unbounded/700.css';
import './styles.css';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import { setWorkerUrl } from 'maplibre-gl';
import mapWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createScreenRouter } from './router.tsx';
import { searchFromState, stateFromSearch } from './state/search.ts';
import { hashSearch, readSaved, startup, writeSaved } from './state/startup.ts';

// MapLibre 6 looks for its worker next to its own module, which the bundle moves: point it at the worker's file.
setWorkerUrl(mapWorkerUrl);

const opening = startup(hashSearch(window.location.hash), readSaved());
const router = createScreenRouter({ opening: opening.source });
if (opening.source !== 'default') {
	// The link with its invalid values replaced, or the saved state put into the link.
	const search = searchFromState(stateFromSearch(opening.search));
	await router.navigate({ to: '/', search, replace: true });
	// An opened link becomes the current state and overwrites the saved one.
	writeSaved(search);
}

const queryClient = new QueryClient();

const root = document.getElementById('root');
if (root === null) {
	throw new Error('index.html has no #root');
}
createRoot(root).render(
	<StrictMode>
		<QueryClientProvider client={queryClient}>
			<RouterProvider router={router} />
		</QueryClientProvider>
	</StrictMode>,
);
