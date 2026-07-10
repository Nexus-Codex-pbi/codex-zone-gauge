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

## 9. Visual Title (TITLE-01, D-13/D-14, migrated to shared `_shared/formatting/titleSettings`)
- [ ] Show Title toggle appears in the format pane under "Visual Title"; default OFF
- [ ] Enabling Show Title + entering Title Text renders a title inside the visual's own iframe (an SVG text element above the gauge, unchanged rendering from before this migration)
- [ ] Title Font (family/size/bold/italic/underline), Alignment, and Font Color all apply correctly
- [ ] Old saved report (no title properties set) renders with no title — pixel-identical to pre-upgrade (showTitle defaults false)

## 10. Per-Surface Text Treatment (TEXT-01) — value readout + zone label ONLY
- [ ] Value readout Font — family/bold/italic/underline apply to the central value text
- [ ] Zone Label Font — family/bold/italic/underline apply to the zone label text below the value (e.g. Poor/Acceptable/Good)
- [ ] Old saved report (no new font properties set): value renders bold (700, unchanged), zone label renders normal weight (400, closest match to the prior hardcoded 500 weight)
- [ ] Zone callouts (arc labels), gauge arcs, needle, hub, target/comparison markers remain completely untouched — no font/text controls added to these (scope guard: look overhaul deferred to Phase 2)

## 11. Text-Colour fx (TEXT-02)
- [ ] fx button appears next to Value Color swatch (Value Display card) in the format pane
- [ ] Binding a measure to a conditional formatting rule on Value Color changes the value readout colour
- [ ] With no rule bound and Value Color left empty, the value readout still falls back to matching the current zone colour (pre-existing "leave empty to match zone colour" idiom, unchanged)

## 12. Scope Guard Verification (T-11-04)
- [ ] `git diff` on this plan's Zone Gauge changes touches ONLY: settings.ts title/value/label properties, capabilities.json title/value/label properties, visual.ts title-adjacent code + value/label render sites + 2 fx wiring blocks
- [ ] No changes to zone gradient fills, needle rendering, hub, arc geometry, target/comparison marker code, or zone callout (arc label) code

## 13. Audit-Board Polish (01-18 Task 4) — NON-conflicting only, full rebuild is Phase 3
- [ ] Active zone (the one containing the current value) renders visibly brighter/lit than the other two zones, which dim well below the pre-existing flat opacity
- [ ] Moving the bound value across zone boundaries re-lights the newly-active zone and dims the previously-active one on the next render
- [ ] High contrast: all three zones keep the pre-existing flat opacity (0.5) — no active/dim distinction under HC (opacity-only status is avoided under the HC contract)
- [ ] The value readout (central number) always paints visually on top of the needle, hub, target marker/line, and comparison marker/line, regardless of gauge type or overlap — confirmed via the constructor's DOM append order (value/label text appended last)
- [ ] Target tick's declared default is now the shared v3 violet target token (`#6d28d9`) instead of the old navy `#130064` — an old saved report with an explicit Target Color keeps its saved value (D-06/D-16)
- [ ] Needle defaults to solid black (`#000000`) on a light-theme background (Background Colour left at its white default) when Needle Color is left at its own "auto" empty-string default
- [ ] Needle defaults to the band/zone-tinted colour (unchanged pre-existing behaviour) when the configured Background Colour reads as a dark theme
- [ ] An explicit, non-empty Needle Color override still resolves untouched regardless of theme (D-16)
- [ ] Confirmed via `git diff`: no dome/face, no 3D metallic hub, no six-style gallery, no gauge-style-selector property added — the full rebuild (GAUGE-02/03) stays deferred to Phase 3
- [ ] `npx pbiviz package` exits 0