import { useEffect, useLayoutEffect, useRef, useState } from 'react';

// Tile placement from React Bits' Masonry (https://reactbits.dev/components/masonry): the column
// count comes from viewport breakpoints, and each tile, in order, drops into whichever column is
// currently shortest. One change for this page: it doesn't scroll, so instead of letting columns
// run to different lengths, each column's tiles are scaled so the column exactly fills the
// container height (tiles keep their relative heights within a column).

// React Bits' breakpoints, except it bottoms out at 2 columns rather than 1 - a single
// non-scrolling column would squash every tile into a sliver.
const COLUMN_QUERIES = ['(min-width:1500px)', '(min-width:1000px)', '(min-width:600px)'];
const COLUMN_COUNTS = [5, 4, 3];
const MIN_COLUMNS = 2;

export interface MasonryTile {
    x: number;
    y: number;
    w: number;
    h: number;
}

export function useMasonryColumns(): number {
    const get = () => COLUMN_COUNTS[COLUMN_QUERIES.findIndex(q => window.matchMedia(q).matches)] ?? MIN_COLUMNS;
    const [columns, setColumns] = useState(get);

    useEffect(() => {
        const handler = () => setColumns(get);
        const lists = COLUMN_QUERIES.map(q => window.matchMedia(q));
        lists.forEach(l => l.addEventListener('change', handler));
        return () => lists.forEach(l => l.removeEventListener('change', handler));
    }, []);

    return columns;
}

export function useMeasure<T extends HTMLElement>() {
    const ref = useRef<T | null>(null);
    const [size, setSize] = useState({ width: 0, height: 0 });

    useLayoutEffect(() => {
        if (!ref.current) return;
        const ro = new ResizeObserver(([entry]) => {
            const { width, height } = entry.contentRect;
            setSize({ width, height });
        });
        ro.observe(ref.current);
        return () => ro.disconnect();
    }, []);

    return [ref, size] as const;
}

// `weights` are each tile's natural height, in any unit - only the ratios matter.
export function masonryLayout(weights: number[], columns: number, width: number, height: number, gap: number): MasonryTile[] {
    if (!width || !height) return [];

    const columnWidth = (width - (columns - 1) * gap) / columns;
    const colHeights = new Array(columns).fill(0);
    const colMembers: number[][] = Array.from({ length: columns }, () => []);

    // React Bits' placement: shortest column wins.
    weights.forEach((weight, index) => {
        const col = colHeights.indexOf(Math.min(...colHeights));
        colMembers[col].push(index);
        colHeights[col] += weight;
    });

    // Scale each column to fill the container height.
    const tiles: MasonryTile[] = new Array(weights.length);
    colMembers.forEach((members, col) => {
        const usable = height - (members.length - 1) * gap;
        let y = 0;
        for (const index of members) {
            const h = (weights[index] / colHeights[col]) * usable;
            tiles[index] = { x: col * (columnWidth + gap), y, w: columnWidth, h };
            y += h + gap;
        }
    });

    return tiles;
}
