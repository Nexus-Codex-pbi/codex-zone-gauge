# Test Plan – Codex Zone Gauge

## 1. Functional Tests
- [ ] Visual loads without errors
- [ ] Visual renders with sample data (value bound)
- [ ] Visual handles empty data gracefully (shows empty state)
- [ ] All format pane options apply correctly (gauge settings, zones, target, comparison, value display)
- [ ] Selection / cross-filter works (when Category bound, clicking gauge filters other visuals)
- [ ] Tooltips appear on hover (showing value, target, comparison, min/max)
- [ ] Context menu appears on right-click

## 2. Performance Tests
- [ ] update() completes < 250ms with sample data
- [ ] No memory leaks (test with repeated updates)
- [ ] Bundle size < 2.5 MB

## 3. Accessibility Tests
- [ ] Keyboard navigation works (tab to visual, Enter/Space triggers click/context menu)
- [ ] High contrast mode supported (colors adapt to theme)
- [ ] ARIA labels present (on container for click and context menu)
- [ ] No flashing content

## 4. Security Tests
- [ ] No external network calls (verify no network traffic in dev tools)
- [ ] No telemetry (no calls to external endpoints)
- [ ] No external scripts or fonts (all resources bundled)
- [ ] No DOM escape or eval (check code for unsafe patterns)

## 5. Packaging Tests
- [ ] pbiviz builds successfully (npm install && pbiviz package)
- [ ] Bundle size < 2.5 MB
- [ ] capabilities.json valid (passes schema validation)

## 6. Sample PBIX Verification
- [ ] Demonstrates all features (gauge types, zones, target, comparison, value display)
- [ ] Demonstrates formatting options (all format pane sections)
- [ ] Demonstrates interactions (click-to-filter, context menu, tooltips)