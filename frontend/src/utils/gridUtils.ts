// parsec-frontend/src/canvas/utils/gridUtils.ts

/**
 * Defines the parameters for our grid system.
 */
export const GRID_CONFIG = {
    // The base size of the smallest grid square in canvas units.
    BASE_SIZE: 10,
    // The line color for major grid lines.
    MAJOR_LINE_COLOR: '#404040',
    // The line color for minor grid lines.
    MINOR_LINE_COLOR: '#383838',
    // At what zoom scale do we start showing minor lines?
    MINOR_LINE_VISIBILITY_THRESHOLD: 1.5,
  };
  
  /**
   * Creates a tileable SVG grid pattern as a base64 data URL.
   * This is highly performant as it's rendered by the browser's CSS engine.
   * @param size - The size of the tile in pixels.
   * @param majorLineColor - The color of the main grid lines.
   * @param minorLineColor - The color of the sub-division lines.
   * @param showMinorLines - Whether to render the sub-division lines.
   * @returns A base64 encoded data URL for use in a CSS `background-image`.
   */
  const createGridDataURL = (
    size: number,
    majorLineColor: string,
    minorLineColor: string,
    showMinorLines: boolean,
  ): string => {
    const half = size / 2;
  
    // An SVG pattern that draws a crosshair. If minor lines are shown,
    // it draws a full grid; otherwise, it only draws the major lines at the edges.
    const svg = `
      <svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <pattern id="grid" width="${size}" height="${size}" patternUnits="userSpaceOnUse">
            ${
              showMinorLines ? 
              `<path d="M ${half} 0 V ${size} M 0 ${half} H ${size}" stroke="${minorLineColor}" stroke-width="0.5"/>` : 
              ''
            }
            <path d="M ${size} 0 V ${size} M 0 ${size} H ${size}" stroke="${majorLineColor}" stroke-width="1"/>
          </pattern>
        </defs>
        <rect width="${size}" height="${size}" fill="url(#grid)"/>
      </svg>
    `.trim();
  
    // We must use btoa() to encode the SVG for use in a data URL.
    return `data:image/svg+xml;base64,${btoa(svg)}`;
  };
  
  /**
   * Calculates the dynamic grid properties based on the current canvas zoom level.
   * This implements an adaptive grid that shows more detail as you zoom in.
   * @param stageScale - The current scale (zoom level) of the Konva stage.
   * @returns An object containing the calculated `backgroundSize`, `backgroundPosition`, and `backgroundImage` URL.
   */
  export const getGridStyles = (stageScale: number, stagePos: {x: number, y: number}) => {
    // Determine the effective grid size based on zoom.
    // We double the grid size for every halving of the zoom, creating discrete zoom levels for the grid.
    let currentGridSize = GRID_CONFIG.BASE_SIZE;
    let scale = stageScale;
    while (scale < 0.5) {
      scale *= 2;
      currentGridSize *= 2;
    }
    while (scale > 1) {
      scale /= 2;
      currentGridSize /= 2;
    }
    
    const scaledGridSize = currentGridSize * stageScale;
    
    // Determine if we are zoomed in enough to show the minor grid lines.
    const showMinorLines = stageScale > GRID_CONFIG.MINOR_LINE_VISIBILITY_THRESHOLD;
  
    // Generate the appropriate data URL for the current grid configuration.
    const gridUrl = createGridDataURL(
      scaledGridSize,
      GRID_CONFIG.MAJOR_LINE_COLOR,
      GRID_CONFIG.MINOR_LINE_COLOR,
      showMinorLines
    );
  
    return {
      // The background is positioned based on the stage's pan position, creating the illusion
      // that the grid is part of the infinite canvas.
      backgroundPosition: `${stagePos.x}px ${stagePos.y}px`,
      // The size of the repeating tile.
      backgroundSize: `${scaledGridSize}px ${scaledGridSize}px`,
      // The dynamically generated grid image.
      backgroundImage: `url('${gridUrl}')`,
    };
  };