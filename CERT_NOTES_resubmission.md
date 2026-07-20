# Codex Zone Gauge — Cert Notes (resubmission wave, Phase 01)

**Version:** 1.1.0.12 (visual.version) · production GUID unchanged (`codexZoneGauge…`) · API 5.11.0 / pbiviz 7.0.2 (pinned).

One-wave AppSource resubmission carrying the transparency/formatting rework **and** the v2 appearance redesign. Partner Center re-evaluates the whole package (Pitfall 6).

## Transparency wave (Plans 04–05)
- New **Background** card: `ColorPicker` fill + 0–100 `transparency` slider via `hexToRGBString`. Additive.
- fx conditional formatting wired on eligible colour properties.

## Title + per-region text wave (Plans 11–12)
- Title + per-region text treatment reworked with adaptive text colour.

## v2 Appearance wave (Plan 18)
- Needle **'auto'** empty-string sentinel now resolves to solid black on **light theme only**; dark theme keeps the zone-tinted needle; an explicit **Needle Color** is unaffected by the sentinel change.
- Band-engine / ramp / corner-bracket / glow appearance applied per the v2 board.
- **D-16:** saved colour/fx overrides still resolve.

## High-contrast rule
Shared HC rule wired (`src/shared/highContrast.ts`).

## Pending fixes riding this wave
None — the value-arc opacity fix (`c67c59f`, 0.45→0.25) already shipped with the prior submission (PENDING-FIXES: nothing pending).
