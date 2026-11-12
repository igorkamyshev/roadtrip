// The list of all the ring's points of interest (spec #20 «Экран», «Карусель»; spec #154 «Экран»), «Всё в кольце 1–2 ч:
// 42»: a sheet, opened by «и ещё K / Всё в кольце →» or by a point on the map that has no card in the carousel. A ring
// of the last hour can hold thousands of them, so the list is virtual (TanStack Virtual): only the rows in view are on
// the page.
import { useVirtualizer } from '@tanstack/react-virtual';
import { useEffect, useRef, type ReactElement } from 'react';
import { hoursShort } from '../screen/copy.ts';
import { Sheet } from '../screen/sheets.tsx';
import { PointRowText } from './point-card.tsx';
import type { PointOfInterest } from './point-of-interest.ts';

/** A row's height in pixels, fixed so that the list needs no measuring (styles.css, `.point-row`). */
const ROW_HEIGHT = 60;

export interface PointsSheetProps {
	/** The ring's points of interest, the most famous first. */
	readonly points: readonly PointOfInterest[];
	readonly hours: number;
	/** The chosen point's key: marked, and scrolled to when the list opens. */
	readonly chosen: string | undefined;
	readonly onPick: (point: PointOfInterest) => void;
	readonly onClose: () => void;
}

export function PointsSheet({ points, hours, chosen, onPick, onClose }: PointsSheetProps): ReactElement {
	const body = useRef<HTMLDivElement>(null);
	// oxlint-disable-next-line react/incompatible-library -- the rule guards React Compiler's memoization, which this build does not run: the list renders anew as it scrolls
	const list = useVirtualizer({ count: points.length, getScrollElement: () => body.current, estimateSize: () => ROW_HEIGHT, overscan: 6 });
	const opened = useRef(false);
	useEffect(() => {
		if (opened.current) {
			return;
		}
		opened.current = true;
		const index = points.findIndex((point) => point.key === chosen);
		if (index > 0) {
			list.scrollToIndex(index, { align: 'center' });
		}
	}, [points, chosen, list]);
	const title = `Всё в кольце ${hoursShort(hours)}: ${points.length}`;
	return (
		<Sheet title={title} onClose={onClose} bodyRef={body} steady>
			<div className="point-list" style={{ height: list.getTotalSize() }}>
				{list.getVirtualItems().map((item) => {
					const point = points[item.index];
					const isChosen = point.key === chosen;
					return (
						<button
							key={point.key}
							type="button"
							className={['row', 'point-row', point.group ?? '', isChosen ? 'on' : ''].filter((name) => name !== '').join(' ')}
							data-testid="point-row"
							aria-current={isChosen ? 'true' : undefined}
							style={{ transform: `translateY(${item.start}px)` }}
							onClick={() => {
								onPick(point);
							}}
						>
							<PointRowText point={point} />
						</button>
					);
				})}
			</div>
		</Sheet>
	);
}
