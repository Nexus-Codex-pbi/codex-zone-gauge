# Developer Guide: pbiZoneGauge

## Architecture
The visual follows a standard Power BI custom visual structure:
- **visual.ts**: Main visual class implementing `IVisual`.
- **settings.ts**: Defines the formatting settings model using `powerbi-visuals-utils-formattingmodel`.
- **utils.ts**: Contains helper functions (clamp, CODEX_TOKENS).
- **style/visual.less**: Styles for the visual (though the visual primarily uses SVG via D3.js).
- **capabilities.json**: Defines data roles, objects, and capabilities.
- **pbiviz.json**: Manifest file with metadata.

**Rendering Model**:
The visual uses D3.js to create and update an SVG gauge. The SVG is created once in the constructor and updated on each `update` call. The visual does not recreate the entire SVG on every update, only updating the necessary attributes (paths, text, colors, etc.) and using transitions for animations.

The gauge is composed of several SVG elements:
- Border arc (background)
- Three zone arcs (danger, warning, success)
- Value arc (current value)
- Target line and marker
- Comparison line and marker
- Zone labels (callouts)
- Value text and label text
- Title (iframe-internal)

## capabilities.json Summary
- **Data Roles**: 6 roles (Category, Value, Target, Comparison, Minimum, Maximum). 
  - Category: Grouping (optional, enables click-to-filter)
  - Value, Target, Comparison, Minimum, Maximum: Measure (numeric)
- **Data View Mapping**: Categorical with categories selecting Category and values selecting Value, Target, Comparison, Minimum, Maximum.
- **Objects**: Six formatting objects (titleSettings, gaugeSettings, zones, comparisonSettings, targetSettings, valueDisplay) controlling appearance.
- **Features**: Supports highlighting, keyboard focus, landing page, empty data view, multi-visual selection, and tooltips (default and canvas).
- **Privileges**: None.

## APIs Used
- **Selection Manager (`ISelectionManager`)**: 
  - For click-to-filter (when Category is bound) and context menu.
  - Used in constructor to create selection manager and in click/contextmenu event handlers.
- **Tooltip Service (`ITooltipService`)**:
  - To show and hide tooltips on mousemove and mouseleave.
  - Builds tooltip data array from value, target, comparison, and zone information.
- **Event Service (`IVisualEventService`)**:
  - Calls `renderingStarted` and `renderingFinished` to coordinate with Power BI's rendering cycle.
- **Host (`IVisualHost`)**:
  - Access to color palette (for high contrast), locale, and creation of selection manager, tooltip service, and localization manager.
- **Localization Manager (`ILocalizationManager`)**:
  - Currently unused but initialized for potential future localization.
- **Formatting Settings Service (`FormattingSettingsService`)**:
  - Populates the formatting settings model from the data view.
- **Power BI Utilities**:
  - `powerbi-visuals-utils-formattingmodel` for strongly-typed formatting settings.
- **D3.js**:
  - `d3-selection`: For creating and manipulating SVG elements.
  - `d3-scale`: For linear scales (value to angle, value to radius, etc.).
  - `d3-shape`: For arc generation.
  - `d3-interpolate`: For value interpolation during animation.
  - `d3-transition`: For animating changes.

## Performance Considerations
- **SVG Updates**: The visual updates only the necessary attributes (d, fill, stroke, text, etc.) on existing SVG elements, avoiding expensive recreation.
- **Animations**: Uses D3 transitions for smooth value changes, which are performant for simple gauges.
- **Data Parsing**: The visual processes only the first row of each measure (Value, Target, Comparison, Minimum, Maximum) and the first row of Category (for selection ID).
- **Selection ID**: Creation of selection ID is done only when Category is bound.
- **Tooltip Data**: Tooltip array is rebuilt only when data changes, but it is small (max 5-6 items).

## Accessibility Implementation
- **Keyboard Navigation**: The visual sets `tabindex` implicitly by being a focusable element (svg). Click and key handlers (Enter/Space) are attached to the SVG for activation (click-to-filter).
- **High Contrast**: Uses `host.colorPalette.isHighContrast` to adjust colors to system colors. In high contrast mode, the visual uses the foreground color for all gauge elements (border, zones, value arc, target, comparison, text) and the background color for the gauge background.
- **Screen Reader**: 
  - The visual sets `role="img"` on the SVG container and provides an `aria-label` that describes the gauge (value, min, max, target, comparison, zones).
  - All text elements (title, zone labels, value text, label text) are set via `textContent` (or SVG text equivalent) and are accessible.
  - The visual does not rely solely on ARIA because the text content is sufficient, but it enhances accessibility with aria-label and role.
- **Color Usage**: The visual does not rely solely on color to convey information. The gauge uses both color and position (angle along the arc) to encode the value, target, and comparison.
- **Focus Indicator**: The visual relies on the browser's default focus outline for keyboard users (the SVG element gets a focus outline when focused).

## Security Compliance
- **No External Calls**: The visual does not load any external scripts (`externalJS` is null) and makes no network requests.
- **No eval/dynamic code**: All code is static; no use of `eval`, `Function`, `setTimeout` with strings, etc.
- **Safe DOM/SVG**: Uses D3.js for SVG manipulation, which uses safe DOM methods. No `innerHTML` or `outerHTML` is used.
- **No Data Persistence**: Does not use `localStorage`, `sessionStorage`, or cookies.
- **No Privileges**: The `privileges` array in `capabilities.json` is empty.

## Build & Packaging
- **Dependencies**: 
  - `powerbi-visuals-api`
  - `powerbi-visuals-utils-formattingmodel`
  - `d3-selection`
  - `d3-scale`
  - `d3-shape`
  - `d3-interpolate`
  - `d3-transition`
- **Build Steps** (typical for Power BI visuals):
  1. Install dependencies: `npm install`
  2. Compile TypeScript: `npm run build` (or `tsc -p .`)
  3. Package the visual: `pbiviz package`
- **Output**: The packaged `.pbiviz` file is found in the `dist/` directory.
- **Validation**: Use `pbiviz validate` to check the package against Power BI requirements.
- **Debugging**: Use `pbiviz start` to run the visual in debug mode with hot reload.

## Additional Notes
- The visual uses the `clamp` helper function from `utils.ts` for value clamping.
- The visual supports right-click context menu via `selectionManager.showContextMenu`.
- The visual does not support custom tooltips beyond the built-in visual tooltip; it does not use the `ITooltipService` for custom tooltip pages.
- The gauge animations are configurable via the Animation Duration setting (in milliseconds).