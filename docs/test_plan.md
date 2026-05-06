# Test Plan for pbiZoneGauge

## Functional Tests
### Rendering
- [ ] Renders correctly when only Value field is bound
- [ ] Renders correctly when Value and Target fields are bound
- [ ] Renders correctly when Value, Target, and Comparison fields are bound
- [ ] Renders correctly when all fields (Value, Target, Comparison, Minimum, Maximum) are bound
- [ ] Renders correctly when Category field is bound (for click-to-filter)
- [ ] Displays empty state when no data bound or Value is null
- [ ] Handles numeric values (integers, decimals) correctly
- [ ] Handles percentage values correctly (when format set to Percent)
- [ ] Handles currency values correctly (when format set to Currency)
- [ ] Renders gauge in Semi-circle, Three-quarter, and Arc types
- [ ] Renders zones with solid colors when Use Gradient is disabled
- [ ] Renders zones with gradient when Use Gradient is enabled
- [ ] Shows/hides zone labels based on Show Zone Labels setting
- [ ] Places zone labels correctly based on Zone Label Position (band, outerEdge, innerEdge)
- [ ] Shows/hides target marker based on Show Target setting
- [ ] Shows/hides comparison marker based on Show Comparison Marker setting
- [ ] Changes target marker style between Line and Marker
- [ ] Changes comparison marker style between Line and Marker
- [ ] Displays value as text when Show Value is enabled
- [ ] Displays label text when Show Label is enabled
- [ ] Changes value format between Number and Percent
- [ ] Changes decimal places display correctly
- [ ] Changes value color and label color correctly
- [ ] Changes gauge thickness correctly
- [ ] Shows/hides outer border based on Show Border setting
- [ ] Changes border color and width correctly
- [ ] Animation duration affects the speed of value changes
- [ ] Visual title appears/disappears based on Show Title setting
- [ ] Visual title text, font, size, style, alignment, and color work correctly

### Interactions
- [ ] Tooltip appears on hover when visual has data (shows value, target, comparison, min, max, zone info)
- [ ] Tooltip hides on mouse leave
- [ ] Context menu appears on right-click (standard Power BI context menu)
- [ ] Click-to-filter: When Category is bound, clicking the gauge filters other visuals by that category
- [ ] Click-to-filter: Ctrl/Cmd-click enables multi-select filtering
- [ ] Click-to-filter: When Category is not bound, clicking the gauge does nothing (no filter)
- [ ] Visual selection: Visual can be selected (single click) and shows selection border
- [ ] Multi-visual selection: Visual can be part of group selection (Ctrl/Cmd-click)
- [ ] Highlighting: Visual responds to highlighting from other visuals (if supported)
- [ ] Responsive design: Gauge scales correctly when container size changes

## Performance Tests
- [ ] Visual renders within 100ms for typical data updates
- [ ] Visual maintains smooth interaction (hover, click) at 60fps
- [ ] Memory usage does not grow with repeated updates (no leaks)
- [ ] Visual handles rapid sequential updates (e.g., from slicer) without stutter
- [ ] Animation completes smoothly without blocking the UI
- [ ] SVG element count remains stable after initial render (no excessive recreation)

## Accessibility Tests
- [ ] Keyboard Navigation
  - [ ] Visual is focusable via Tab key
  - [ ] Enter key activates click (filter if Category bound)
  - [ ] Space bar activates click (filter if Category bound)
  - [ ] Shift+F10 or context menu key opens context menu
  - [ ] Focus outline is visible when focused
- [ ] High Contrast Mode
  - [ ] Gauge elements (border, zones, value arc, target, comparison, text) use system foreground color
  - [ ] Gauge background uses system background color or is transparent
  - [ ] All text remains readable in high contrast mode
  - [ ] Visual functions correctly when Windows high contrast enabled
- [ ] Screen Reader
  - [ ] All text content (title, zone labels, value text, label text) is announced
  - [ ] The gauge's aria-label (if present) describes the value, min, max, target, comparison, and zones
  - [ ] Visual announces as a single logical unit
  - [ ] No inaccessible interactive elements
- [ ] Color Usage
  - [ ] Visual does not rely solely on color to convey information (uses position and color)
  - [ ] Zones use color to indicate performance levels but also have labels
  - [ ] Sufficient contrast between gauge elements and background in default themes
- [ ] Text Scaling
  - [ ] Visual respects browser/text scaling settings
  - [ ] Font sizes scale appropriately with system settings
  - [ ] No text clipping or overflow at larger text sizes

## Security Tests
- [ ] No external network requests are made (verify via browser dev tools)
- [ ] No telemetry data is collected or transmitted
- [ ] Visual does not use eval(), Function(), or similar dynamic code
- [ ] Visual does not use innerHTML or outerHTML for DOM injection (uses SVG and D3.js safely)
- [ ] All data binding uses textContent or safe DOM/SVG APIs
- [ ] Visual does not access localStorage, sessionStorage, or cookies
- [ ] Visual does not request additional privileges (privileges array empty)
- [ ] Visual only uses approved dependencies (powerbi-visuals-api, powerbi-visuals-utils-formattingmodel, d3-selection, d3-scale, d3-shape, d3-interpolate, d3-transition)

## Packaging Tests
- [ ] pbiviz.json validates against schema (pbiviz validate)
- [ ] All referenced assets (icon, style, string resources) exist
- [ ] capabilities.json is valid JSON and matches visual implementation
- [ ] Visual packages successfully (pbiviz package)
- [ ] Generated .pbiviz file contains correct resources
- [ ] Visual version in pbiviz.json matches expected version
- [ ] Visual description and display name are present

## Sample PBIX Verification
- [ ] Sample PBIX report loads visual without errors
- [ ] Sample PBIX demonstrates all data roles (Value, Target, Comparison, Minimum, Maximum, Category)
- [ ] Sample PBIX demonstrates formatting options (gauge type, zones, target, comparison, value display)
- [ ] Sample PBIX demonstrates click-to-filter functionality
- [ ] Sample PBIX demonstrates tooltip on hover
- [ ] Sample PBIX demonstrates context menu
- [ ] Sample PBIX demonstrates high contrast mode
- [ ] Sample PBIX demonstrates keyboard navigation
- [ ] Sample PBIX saves and reloads correctly (visual state preserved)