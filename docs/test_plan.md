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

## 7. Background Transparency (TRANS-01/02/03/05)
- [ ] Background card (Colour + Transparency) appears in the format pane
- [ ] Old saved report (background properties never set) renders pixel-identical to pre-upgrade — no background painted (transparency defaults to 100 on this visual specifically since the SVG was never painted before this plan, D-06)
- [ ] Setting Transparency to 0% with a colour chosen shows a fully opaque painted background over a non-white report canvas
- [ ] Transparency 50% shows true partial transparency (canvas colour blends through)
- [ ] Light theme and dark theme both render correctly with transparency applied
- [ ] Zone arcs, needle, hub, target/comparison markers, callouts, and typography are visually unchanged from before this plan (scope guard — look overhaul is Phase 2)

## 8. Conditional Formatting / fx (TRANS-04)
- [ ] fx button appears next to Zone 3 Color (Success) swatch in the format pane
- [ ] Binding a rule to Zone 3 Color changes the success-zone colour per data point
- [ ] Data points without a rule fall back to the static Zone 3 Color swatch value