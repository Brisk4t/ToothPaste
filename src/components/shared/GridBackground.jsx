import React, { useMemo, useRef, useState, useEffect } from 'react';

/**
 * Gets grid dimensions (rows and columns) for a given container element
 * @param {HTMLElement} element - The container element to measure
 * @param {number} squareSize - Size of each grid square in pixels
 * @param {Array} filledSquares - Optional array of filled squares to account for max bounds
 * @returns {Object} Object with { rows, cols, width, height }
 */
export function getGridDimensions(element, squareSize, filledSquares = []) {
  if (!element) {
    return { rows: 0, cols: 0, width: 0, height: 0 };
  }

  const width = element.clientWidth;
  const height = element.clientHeight;

  const rows = Math.max(
    Math.ceil(height / squareSize) + 1,
    filledSquares.length > 0 ? Math.max(...filledSquares.map(s => s.row)) + 1 : 0
  );

  const cols = Math.max(
    Math.ceil(width / squareSize) + 1,
    filledSquares.length > 0 ? Math.max(...filledSquares.map(s => s.col)) + 1 : 0
  );

  return { rows, cols, width, height };
}

/**
 * GridBackground - Renders a grid overlay with selective square coloring
 * @param {Array} filledSquares - Array of objects: [{row: 0, col: 0, color: '#00A878', opacity: 0.5}, ...]
 * @param {number} squareSize - Size of each grid square in pixels (default: 50)
 * @param {string} borderColor - Color of grid lines (default: rgba(255, 255, 255, 0.05))
 * @param {number} borderWidth - Width of grid lines in pixels (default: 1)
 * @param {string} backgroundColor - Background fill color (default: transparent)
 * @param {Function} onDimensionsChange - Callback fired with grid dimensions { rows, cols, width, height }
 */
export default function GridBackground({
  filledSquares = [],
  squareSize = 50,
  borderColor = 'rgba(255, 255, 255, 0.05)',
  borderWidth = 1,
  backgroundColor = 'transparent',
  onDimensionsChange
}) {
  const containerRef = useRef(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

  // Update dimensions when container size changes
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const updateDimensions = () => {
      setDimensions({
        width: container.clientWidth,
        height: container.clientHeight
      });
    };

    updateDimensions();

    const resizeObserver = new ResizeObserver(updateDimensions);
    resizeObserver.observe(container);

    return () => resizeObserver.disconnect();
  }, []);

  // Create a map for quick lookup of colored squares
  const filledSquaresMap = useMemo(() => {
    const map = new Map();
    filledSquares.forEach((square) => {
      map.set(`${square.row}-${square.col}`, { color: square.color, opacity: square.opacity ?? 1 });
    });
    return map;
  }, [filledSquares]);

  // Calculate grid dimensions to cover entire viewport
  const maxRows = useMemo(() => {
    const rows = Math.ceil(dimensions.height / squareSize) + 1;
    const filledMax = filledSquares.length > 0 ? Math.max(...filledSquares.map(s => s.row)) + 1 : 0;
    return Math.max(rows, filledMax);
  }, [dimensions.height, squareSize, filledSquares]);

  const maxCols = useMemo(() => {
    const cols = Math.ceil(dimensions.width / squareSize) + 1;
    const filledMax = filledSquares.length > 0 ? Math.max(...filledSquares.map(s => s.col)) + 1 : 0;
    return Math.max(cols, filledMax);
  }, [dimensions.width, squareSize, filledSquares]);

  // Notify parent of grid dimensions when they change
  useEffect(() => {
    if (onDimensionsChange) {
      onDimensionsChange({
        rows: maxRows,
        cols: maxCols,
        width: dimensions.width,
        height: dimensions.height
      });
    }
  }, [maxRows, maxCols, dimensions.width, dimensions.height, onDimensionsChange]);

  // Generate grid squares
  const squares = useMemo(() => {
    const result = [];
    for (let row = 0; row < maxRows; row++) {
      for (let col = 0; col < maxCols; col++) {
        const key = `${row}-${col}`;
        const squareData = filledSquaresMap.get(key);
        result.push({
          row,
          col,
          key,
          color: squareData?.color,
          opacity: squareData?.opacity ?? 1,
          x: col * squareSize,
          y: row * squareSize
        });
      }
    }
    return result;
  }, [maxRows, maxCols, squareSize, filledSquaresMap]);

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 pointer-events-none"
      style={{
        width: '100%',
        height: '100%',
        overflow: 'hidden'
      }}
    >
      <svg
        className="w-full h-full"
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%'
        }}
        viewBox={`0 0 ${dimensions.width} ${dimensions.height}`}
        preserveAspectRatio="none"
      >
        {/* Render filled squares */}
        {squares.map((square) =>
          square.color ? (
            <rect
              key={`filled-${square.key}`}
              x={square.x}
              y={square.y}
              width={squareSize}
              height={squareSize}
              fill={square.color}
              opacity={square.opacity}
              stroke={borderColor}
              strokeWidth={borderWidth}
            />
          ) : null
        )}

        {/* Render grid lines */}
        {/* Vertical lines */}
        {Array.from({ length: maxCols + 1 }).map((_, col) => (
          <line
            key={`v-${col}`}
            x1={col * squareSize}
            y1={0}
            x2={col * squareSize}
            y2={dimensions.height}
            stroke={borderColor}
            strokeWidth={borderWidth}
          />
        ))}

        {/* Horizontal lines */}
        {Array.from({ length: maxRows + 1 }).map((_, row) => (
          <line
            key={`h-${row}`}
            x1={0}
            y1={row * squareSize}
            x2={dimensions.width}
            y2={row * squareSize}
            stroke={borderColor}
            strokeWidth={borderWidth}
          />
        ))}
      </svg>
    </div>
  );
}
