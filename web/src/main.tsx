// The client's entry: PostHog on the production host, the opening state (link, then saved, then defaults), then
// the screen. posthog-js (src/analytics/posthog-client.ts) and MapLibre (src/map/map-view.tsx) come as chunks of their
// own, after the first paint.
import { send, startAnalytics } from './analytics/posthog.ts';
import '@fontsource/golos-text/400.css';
import '@fontsource/golos-text/500.css';
import '@fontsource/golos-text/600.css';
import '@fontsource/golos-text/700.css';
import '@fontsource/unbounded/500.css';
import '@fontsource/unbounded/700.css';
import './styles.css';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createScreenRouter } from './router.tsx';
import { searchFromState, stateFromSearch } from './state/search.ts';
import { hashSearch, readSaved, startup, writeSaved } from './state/startup.ts';

// First, so that PostHog catches the errors of everything after it.
startAnalytics(window.location.hostname);

const opening = startup(hashSearch(window.location.hash), readSaved());
if (opening.source === 'link' && !opening.hadSaved) {
	send('link opened', {});
}
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
