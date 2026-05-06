# Developer Guide – Codex Zone Gauge

## 1. Architecture
- File structure: `src/visual.ts`, `src/settings.ts`, `style/visual.less`, `capabilities.json`, `pbiviz.json`
- Rendering model: SVG-based, built once in constructor; `update()` mutates only existing elements and animates changes.

## 2. Capabilities
- Data roles: 
   - category (Grouping, optional)
   - value (Measure, required, numeric)
   - target (Measure, optional, numeric)
   - comparison (Measure, optional, numeric)
   - minimum (Measure, optional, numeric)
   - maximum (Measure, optional, numeric)
- Format pane cards: titleSettings, gaugeSettings, zones, comparisonSettings, targetSettings, valueDisplay
- supportsHighlight, supportsKeyboardFocus, supportsLandingPage, supportsEmptyDataView, supportsMultiVisualSelection: all true.

## 3. APIs Used
- ISelectionManager — cross-filter + context menu
- ITooltipService — hover tooltips
- ILocalizationManager — string resources
- ISandboxExtendedColorPalette — high-contrast detection (via host.colorPalette)

## 4. Performance
- update() target: < 250ms
- No infinite loops or heavy timers
- DOM minimal — element refs cached on construction
- Uses D3 for SVG rendering and transitions.

## 5. Accessibility
- ARIA labels on interactive elements (the gauge is focusable via selection manager)
- High contrast support via `colorPalette.isHighContrast` (foreground/background colours adapt)
- Keyboard focus on tabbable elements (the gauge container is focusable and handles Enter/Space for click, Shift+F10 for context menu)

## 6. Security
- No external calls
- No telemetry
- No external scripts or fonts
- No eval() or dynamic code

## 7. Build & Packaging
- powerbi-visuals-tools 7.x
- Node 20
- TypeScript 5.5+
- `npm install && pbiviz package`
- Output: `.pbiviz` < 2.5 MB