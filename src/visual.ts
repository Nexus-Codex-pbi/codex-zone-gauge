"use strict";

import powerbi from "powerbi-visuals-api";
import { FormattingSettingsService } from "powerbi-visuals-utils-formattingmodel";
import { arc as d3arc } from "d3-shape";
import { scaleLinear } from "d3-scale";
import { select, Selection } from "d3-selection";
import { interpolate } from "d3-interpolate";
import "d3-transition";
import "./../style/visual.less";

import VisualConstructorOptions = powerbi.extensibility.visual.VisualConstructorOptions;
import VisualUpdateOptions = powerbi.extensibility.visual.VisualUpdateOptions;
import IVisual = powerbi.extensibility.visual.IVisual;
import IVisualEventService = powerbi.extensibility.IVisualEventService;
import IVisualHost = powerbi.extensibility.visual.IVisualHost;
import ISelectionManager = powerbi.extensibility.ISelectionManager;
import ISelectionId = powerbi.visuals.ISelectionId;
import ILocalizationManager = powerbi.extensibility.ILocalizationManager;
import ISandboxExtendedColorPalette = powerbi.extensibility.ISandboxExtendedColorPalette;
import ITooltipService = powerbi.extensibility.ITooltipService;
import VisualTooltipDataItem = powerbi.extensibility.VisualTooltipDataItem;
import DataView = powerbi.DataView;

import { VisualFormattingSettingsModel, textAlignFor } from "./settings";
import { clamp, CODEX_TOKENS } from "./utils";

import { toRgba, compositeOver, surfaceTone, contrastInk, mutedInk } from "./shared/colorHelpers";
import { formatModelNumber } from "./shared/numberFormat";
import { Theme, accentToken, targetToken } from "./shared/bandEngine";
import { surfaceTokens } from "./shared/designTokens";
import { makeCornerBrackets, CardSignatureHandle } from "./shared/cardSignature";
import { applyCardSignature } from "./shared/cardSignatureSettings";
import { applyBorder } from "./shared/borderSettings";
import { resolveCodexTheme, neonColorFor } from "./shared/codexThemeSettings";
import { GaugeRenderCtx, GaugeZone, fitLabel, fitText } from "./renderers/helpers";
import { renderPressureDial, renderSpeedometer, renderTachometer } from "./renderers/dialFamily";
import { renderProgressRing } from "./renderers/ring";
import { renderSegmentedMeter } from "./renderers/meter";
import { renderThermometer } from "./renderers/thermometer";
import { LicenseGate } from "./shared/licensing";

/**
 * Angle ranges for each gauge type (radians).
 *
 * d3.arc treats 0 as 12-o'clock, with angles increasing clockwise.
 * For a gauge that reads left-to-right:
 *   semicircle  : 9-o'clock (-PI/2) to 3-o'clock (+PI/2)  — 180 deg
 *   threeQuarter: -3PI/4 to +3PI/4                          — 270 deg
 *   arc         : -5PI/6 to +5PI/6                          — 300 deg
 *
 * NOTE: d3.arc uses the *mathematical convention* where 0 is top-centre (12-o'clock)
 * and positive angles rotate clockwise. So startAngle = -PI/2 points left (9-o'clock)
 * and endAngle = +PI/2 points right (3-o'clock), giving us the classic bottom-open
 * semicircle gauge.
 */
const GAUGE_ANGLES: Record<string, { start: number; end: number }> = {
    semicircle:   { start: -Math.PI / 2,       end: Math.PI / 2 },
    threeQuarter: { start: -Math.PI * 3 / 4,   end: Math.PI * 3 / 4 },
    arc:          { start: -Math.PI * 5 / 6,   end: Math.PI * 5 / 6 }
};

/** Drop float noise from a derived bound (0.1 * 3 = 0.30000000000000004). */
function tidy(n: number): number {
    return +n.toPrecision(12);
}

/** The next "nice" axis step at or above `rough`: 1, 2, 2.5 or 5 × 10^k. The
 *  scale a reader can actually count in. */
function niceStep(rough: number): number {
    if (!isFinite(rough) || rough <= 0) return 1;
    const magnitude = Math.pow(10, Math.floor(Math.log10(rough)));
    const normalised = rough / magnitude;
    const step = normalised <= 1 ? 1 : normalised <= 2 ? 2 : normalised <= 2.5 ? 2.5 : normalised <= 5 ? 5 : 10;
    return tidy(step * magnitude);
}

/** Fallback precision when the model supplies none; explicit choices are detected in metadata. */
const DECIMAL_PLACES_DEFAULT = 1;

/** A model format string with its fraction section forced to `digits` places,
 *  leaving everything that carries the UNIT — currency symbol, grouping, the
 *  percent sign, every other section of a multi-section format — exactly where
 *  the model put it. Rewriting the string (rather than re-implementing the
 *  formatter with a digit argument) keeps the suite's single reading of a .NET
 *  fraction section in shared/numberFormat, which is not ours to edit. */
function withFractionDigits(format: string, digits: number): string {
    const places = Math.max(0, Math.min(15, Math.round(digits) || 0));
    const fraction = places > 0 ? "." + "0".repeat(places) : "";
    return format.split(";").map(section => {
        if (/\.[0#]+/.test(section)) return section.replace(/\.[0#]+/, fraction);
        // No fraction section to replace: add one after the last digit
        // placeholder, so "$#,##0" -> "$#,##0.00" and "0%" -> "0.00%".
        let last = -1;
        for (let i = 0; i < section.length; i++) {
            if (section[i] === "0" || section[i] === "#") last = i;
        }
        return last < 0 ? section : section.slice(0, last + 1) + fraction + section.slice(last + 1);
    }).join(";");
}

/** Decimals a tick label needs so two adjacent ticks cannot print the same
 *  text. One (the historic fixed rule) for every step of 0.1 or coarser, so no
 *  existing scale's labels move; more only where the step is finer than that. */
function scaleDigits(step: number): number {
    if (!isFinite(step) || step <= 0) return 1;
    return Math.max(1, Math.min(6, Math.ceil(-Math.log10(step)) + 1));
}

/** Scale envelope derived from the DATA, for a gauge whose Minimum/Maximum
 *  wells are empty (NEXUS cycle-15 §1: "With bounds unbound, Value 250 uses the
 *  fixed 0–100 range and displays 100 despite the README promising data-derived
 *  bounds"). The readout already shows the real 250; the AXIS was still the
 *  invented one, so the needle sat welded to the end of a scale nothing in the
 *  report had asked for.
 *
 *  The envelope contains every delivered reading — value, target and comparison,
 *  regardless of whether their markers are switched on, because a scale is
 *  arithmetic and marker visibility is drawing (§4's lesson) — and rounds out to
 *  a nice step so the tick labels stay countable. It is 0-BASED whenever every
 *  reading is non-negative: a gauge that starts at 0 is what a reader assumes
 *  unless the data says otherwise, and a zoomed baseline exaggerates the sweep.
 *  The top lands on the first nice step STRICTLY above the largest reading, so
 *  the highest value is never welded to the end of its own axis. */
function derivedBounds(readings: number[]): { min: number; max: number } {
    const low = Math.min(...readings), high = Math.max(...readings);
    const base = low >= 0 ? 0 : low;
    // All readings identical (a lone Value with no Target is the common case)
    // still needs somewhere for the needle to travel.
    const spread = high > base ? high - base : (Math.abs(high) || 1);
    const step = niceStep(spread / 5);
    return {
        min: base >= 0 ? 0 : tidy((Math.ceil(low / step) - 1) * step),
        max: tidy((Math.floor(high / step) + 1) * step),
    };
}

interface ParsedData {
    value: number;
    target: number | null;
    comparison: number | null;
    /** Minimum / Maximum AS BOUND. `null` means the well is empty (or carries
     *  nothing numeric) and the scale has to be derived from the data — see
     *  derivedBounds(). They used to default to 0 and 100 right here, which is
     *  why an unbound gauge pinned a 250 reading at the end of a 0–100 axis it
     *  had invented (NEXUS cycle-15 §1). */
    min: number | null;
    max: number | null;
    /** The Value column's MODEL format string ("0.0%", "$#,##0.00", …), as the
     *  host delivered it. Null when the measure carries none. It is the only
     *  thing that says what UNIT the number is in — see the readout formatter. */
    valueFormatString: string | null;
    targetFormatString: string | null;
    comparisonFormatString: string | null;
    categoryLabel: string | null;
    selectionId: ISelectionId | null;
}

export class Visual implements IVisual {
    private target: HTMLElement;
    private host: IVisualHost;
    private eventService: IVisualEventService;
    private selectionManager: ISelectionManager;
    private localizationManager: ILocalizationManager;
    private formattingSettings: VisualFormattingSettingsModel = new VisualFormattingSettingsModel();
    private formattingSettingsService: FormattingSettingsService;

    private tooltipService: ITooltipService;

    // Tooltip data for current render
    private currentTooltipItems: VisualTooltipDataItem[] = [];

    // High contrast support
    private isHighContrast: boolean = false;
    private hcForeground: string = "";
    private hcBackground: string = "";
    private surface: string = "#ffffff";

    private svg: Selection<SVGSVGElement, unknown, null, undefined>;
    private backgroundRect: Selection<SVGRectElement, unknown, null, undefined>;
    private defs: Selection<SVGDefsElement, unknown, null, undefined>;
    private titleEl: Selection<SVGTextElement, unknown, null, undefined>;
    // Corner-bracket card signature (suite kit) — accent-tinted overlay on
    // the full-tile root, painted above the gauge SVG. pointer-events:none.
    private cornerSignature: CardSignatureHandle | null = null;
    private gaugeGroup: Selection<SVGGElement, unknown, null, undefined>;
    private altGroup: Selection<SVGGElement, unknown, null, undefined>;
    private zoneSegGroup: Selection<SVGGElement, unknown, null, undefined>;
    private needleHubInner: Selection<SVGCircleElement, unknown, null, undefined>;

    // Persistent SVG selections — created once, updated on each render
    private borderPath: Selection<SVGPathElement, unknown, null, undefined>;
    private zone1Path: Selection<SVGPathElement, unknown, null, undefined>;
    private zone2Path: Selection<SVGPathElement, unknown, null, undefined>;
    private zone3Path: Selection<SVGPathElement, unknown, null, undefined>;
    private valuePath: Selection<SVGPathElement, unknown, null, undefined>;
    private targetLine: Selection<SVGLineElement, unknown, null, undefined>;
    private targetNeedle: Selection<SVGPathElement, unknown, null, undefined>;
    private needleHub: Selection<SVGCircleElement, unknown, null, undefined>;
    private targetMarker: Selection<SVGCircleElement, unknown, null, undefined>;
    private compLine: Selection<SVGLineElement, unknown, null, undefined>;
    private compMarker: Selection<SVGCircleElement, unknown, null, undefined>;
    private zone1Label: Selection<SVGTextElement, unknown, null, undefined>;
    private zone2Label: Selection<SVGTextElement, unknown, null, undefined>;
    private zone3Label: Selection<SVGTextElement, unknown, null, undefined>;
    private valueText: Selection<SVGTextElement, unknown, null, undefined>;
    private labelText: Selection<SVGTextElement, unknown, null, undefined>;
    private emptyText: Selection<SVGTextElement, unknown, null, undefined>;

    /** Stores previous value-arc end angle so animation can tween from it */
    private previousValueAngle: number | null = null;
    /** Stores previous value (for counter animation) */
    private previousValue: number | null = null;
    /** Currently bound selection ID for click-to-filter */
    private currentSelectionId: ISelectionId | null = null;

    private licenseGate: LicenseGate;

    private lastUpdateOptions: VisualUpdateOptions | null = null;
    private destroyed = false;

    private readonly onContextMenu = (e: MouseEvent): void => {
        if (this.host.hostCapabilities?.allowInteractions !== false) {
            this.selectionManager.showContextMenu(this.currentSelectionId || {}, { x: e.clientX, y: e.clientY });
        }
        e.preventDefault();
    };

    private readonly onMouseMove = (e: MouseEvent): void => {
        if (this.currentTooltipItems.length > 0) {
            this.tooltipService.show({
                coordinates: [e.clientX, e.clientY],
                isTouchEvent: false,
                dataItems: this.currentTooltipItems,
                identities: this.currentSelectionId ? [this.currentSelectionId] : [],
            });
        }
    };

    private readonly onMouseLeave = (): void => {
        this.tooltipService.hide({ isTouchEvent: false, immediately: false });
    };


    constructor(options: VisualConstructorOptions) {

        // NO FREE TIER — an unlicensed user gets the whole visual blocked.

        // The check is async, so re-run the last update once it resolves.

        this.licenseGate = new LicenseGate(options.host, () => {

            if (this.lastUpdateOptions) this.update(this.lastUpdateOptions);

        });
        this.formattingSettingsService = new FormattingSettingsService();
        this.target = options.element;
        this.host = options.host;
        this.eventService = options.host.eventService;
        this.selectionManager = options.host.createSelectionManager();
        this.localizationManager = options.host.createLocalizationManager();
        this.tooltipService = options.host.tooltipService;

        this.target.addEventListener("contextmenu", this.onContextMenu);
        this.target.addEventListener("mousemove", this.onMouseMove);
        this.target.addEventListener("mouseleave", this.onMouseLeave);

        // Root carries the suite chrome (Border card, Corner Accents): keep
        // the border inside the tile and anchor the absolutely-positioned
        // corner overlay.
        this.target.style.boxSizing = "border-box";
        this.target.style.position = "relative";

        // Root SVG fills the Power BI tile
        this.svg = select(this.target)
            .append("svg")
            .classed("zone-gauge-svg", true);

        // Corner-bracket card signature (suite kit) — appended after the SVG
        // so it overlays the gauge; accent-tinted, refreshed per render via
        // applyCardSignature. pointer-events:none.
        const constructorPalette = this.host.colorPalette as ISandboxExtendedColorPalette;
        this.cornerSignature = makeCornerBrackets(
            this.target,
            constructorPalette.isHighContrast ? constructorPalette.foreground.value : accentToken("dark"),
            { variant: "cornerBracket", mirror: true, glowMix: constructorPalette.isHighContrast ? 0 : 55 }
        );

        // Click-to-filter (1180.2.2.3 Filter Out)
        this.svg.on("click", (e: MouseEvent) => {
            if (this.currentSelectionId && this.host.hostCapabilities?.allowInteractions !== false) {
                this.selectionManager.select(this.currentSelectionId, e.ctrlKey || e.metaKey);
                e.stopPropagation();
            }
        });
        this.svg.on("keydown", (e: KeyboardEvent) => {
            if (this.currentSelectionId && this.host.hostCapabilities?.allowInteractions !== false && (e.key === "Enter" || e.key === " ")) {
                e.preventDefault();
                e.stopPropagation();
                this.selectionManager.select(this.currentSelectionId, e.ctrlKey || e.metaKey);
            }
            if (this.currentSelectionId && this.host.hostCapabilities?.allowInteractions !== false
                && (e.key === "ContextMenu" || (e.shiftKey && e.key === "F10"))) {
                e.preventDefault();
                const box = this.svg.node().getBoundingClientRect();
                this.selectionManager.showContextMenu(this.currentSelectionId, { x: box.x + box.width / 2, y: box.y + box.height / 2 });
            }
        });

        // ─── Dedicated background layer (D-05) ─────────────────────────
        // First child of the SVG (behind everything, including defs which
        // paints nothing itself). Scope guard (Task 3): background-only —
        // zone arcs, needle, hub, target/comparison markers, callouts, and
        // typography below are untouched (Phase 2 owns the look overhaul).
        this.backgroundRect = this.svg.append("rect").classed("zone-gauge-background", true);

        this.defs = this.svg.append("defs");

        // Iframe-internal title (Policy 1180.2.5 — title region must catch right-clicks
        // inside the visual iframe; PBI auto-title strip is host chrome and absorbs them)
        this.titleEl = this.svg.append("text").classed("zone-gauge-title", true);

        this.gaugeGroup = this.svg.append("g").classed("gauge-group", true);

        // Alternate-instrument group (GAUGE-02 style dispatch) — non-remix
        // renderers own and rebuild this group; exactly one of
        // gaugeGroup/altGroup is visible per render.
        this.altGroup = this.svg.append("g").classed("alt-instrument-group", true);

        // Border arc (behind everything)
        this.borderPath = this.gaugeGroup.append("path").classed("border-arc", true);

        // Zone background arcs (drawn at reduced opacity)
        this.zone1Path = this.gaugeGroup.append("path").classed("zone-arc zone-1", true);
        this.zone2Path = this.gaugeGroup.append("path").classed("zone-arc zone-2", true);
        this.zone3Path = this.gaugeGroup.append("path").classed("zone-arc zone-3", true);
        // Segmented zone treatment (GAUGE-02 remix default): LED blocks
        // rendered here instead of the three solid paths above; also hosts
        // the scale endpoint labels. Same z-slot as the zone paths.
        this.zoneSegGroup = this.gaugeGroup.append("g").classed("zone-segments", true);

        // Value overlay arc (full opacity, slightly inset)
        this.valuePath = this.gaugeGroup.append("path").classed("value-arc", true);

        // Value needle (tachometer style, from centre)
        this.targetNeedle = this.gaugeGroup.append("path").classed("value-needle", true);
        this.needleHub = this.gaugeGroup.append("circle").classed("needle-hub", true);
        // Board v2 hub: coloured ring + dark inner dot (.hub / .hubi)
        this.needleHubInner = this.gaugeGroup.append("circle").classed("needle-hub-inner", true);

        // Target indicators
        this.targetLine = this.gaugeGroup.append("line").classed("target-line", true);
        this.targetMarker = this.gaugeGroup.append("circle").classed("target-marker", true);

        // Comparison indicators
        this.compLine = this.gaugeGroup.append("line").classed("comparison-line", true);
        this.compMarker = this.gaugeGroup.append("circle").classed("comparison-marker", true);

        // Zone callout labels
        this.zone1Label = this.gaugeGroup.append("text").classed("zone-callout zone-1-label", true);
        this.zone2Label = this.gaugeGroup.append("text").classed("zone-callout zone-2-label", true);
        this.zone3Label = this.gaugeGroup.append("text").classed("zone-callout zone-3-label", true);

        // Text elements
        this.valueText = this.gaugeGroup.append("text").classed("value-text", true);
        this.labelText = this.gaugeGroup.append("text").classed("label-text", true);
        this.emptyText = this.gaugeGroup.append("text").classed("empty-text", true);
    }

    public update(options: VisualUpdateOptions): void {
        if (this.destroyed) return;
        this.eventService.renderingStarted(options);
        this.lastUpdateOptions = options;

        if (this.licenseGate.blockedThisFrame()) {
            this.target.style.display = "none";
            this.eventService.renderingFinished(options);
            return;
        }
        this.target.style.display = "";

        try {
            // High contrast detection
            const colorPalette = this.host.colorPalette as ISandboxExtendedColorPalette;
            this.isHighContrast = !!(colorPalette && colorPalette.isHighContrast);
            if (this.isHighContrast) {
                this.hcForeground = colorPalette.foreground.value;
                this.hcBackground = colorPalette.background.value;
            }

            const dataView: DataView = options.dataViews && options.dataViews[0];
            this.formattingSettings = this.formattingSettingsService.populateFormattingSettingsModel(
                VisualFormattingSettingsModel, dataView
            );

            // Legacy persisted Style values ("remix", retired 2026-07-17)
            // resolve to UNDEFINED against the shrunk dropdown — the
            // formattingmodel populate does items.find() and old reports
            // would crash both the render and the pane build. Normalize to
            // the default entry (caught by the style-sweep legacy scenario).
            for (const slice of [
                this.formattingSettings.gaugeStyleCard.style,
                this.formattingSettings.gaugeStyleCard.dialFace,
                this.formattingSettings.valueDisplayCard.valueFormat,
                this.formattingSettings.valueArcCard.arcStyle,
                this.formattingSettings.zonesCard.bandingMode,
                this.formattingSettings.zonesCard.polarity,
            ]) {
                if (!slice.value) slice.value = slice.items[0];
            }

            // v3 theme pick (01-18 Task 4, audit-board polish) — drives the
            // needle's theme-aware default fallback below. Scope guard: this
            // is the ONLY new engine-level primitive Task 4 introduces; no
            // dome/face/hub/six-style rebuild (Phase 3, GAUGE-02/03).
            const background = this.formattingSettings.background;
            const autoBgHex = background.backgroundColor.value?.value ?? "#ffffff";
            const autoTransparencyPct = background.transparency.value ?? 100;
            const behindHex = colorPalette?.background?.value || "#ffffff";
            const autoSurface = this.isHighContrast ? this.hcBackground
                : compositeOver(autoBgHex, autoTransparencyPct, behindHex);
            const autoTheme: Theme = surfaceTone(autoSurface);
            // ─── Nexus Codex Theme (#819) ──────────────────────────────
            // The ONE switch above the automatic pick, resolved exactly
            // ONCE here and routed into every instrument through the
            // render context (this visual has five renderers; resolving
            // per-renderer would let the surface and the marks disagree).
            // Auto returns the values derived immediately above, so a
            // report that never touched the card renders byte-identically.
            // Dark/Light/Neon paint the Codex surface at the card's own
            // Surface Transparency and force the token set. HC already
            // collapsed to Auto inside the resolver.
            const codex = resolveCodexTheme(this.formattingSettings.codexTheme, {
                hcActive: this.isHighContrast, autoTheme, autoBgHex, autoTransparencyPct, behindHex,
            });
            // A forced mode OWNS the text inks against its own composited
            // surface — a readout colour the user picked for a white tile
            // is not a choice about the Codex dark surface. Zone, needle,
            // target and comparison colours stay the user's: they carry
            // the gauge's MEANING, not its chrome.
            const inkOverride = codex.mode !== "auto";
            this.surface = this.isHighContrast ? this.hcBackground : codex.surfaceHex;
            const theme: Theme = codex.theme;
            this.svg.style("color", this.isHighContrast ? this.hcForeground
                : contrastInk(this.surface, "#000000", "#ffffff"));

            const width = Math.max(0, Number.isFinite(options.viewport.width) ? options.viewport.width : 0);
            const height = Math.max(0, Number.isFinite(options.viewport.height) ? options.viewport.height : 0);

            this.svg.attr("width", width).attr("height", height);

            // ─── Dedicated background layer (D-05) ─────────────────────
            // First child of the SVG, behind the gauge group. Never
            // whole-root opacity. Transparency default is overridden to
            // 100 in settings.ts (this visual's SVG was never painted
            // before this plan — fully transparent), so an OLD saved
            // report renders alpha 0, pixel-identical, per D-06.
            if (!this.isHighContrast) {
                // Codex Theme owns this fill in a forced mode: the Codex card
                // surface at the card's Surface Transparency, INSTEAD of the
                // Background colour. In Auto the resolver hands back the
                // Background card's own fill and transparency unchanged.
                this.backgroundRect
                    .attr("width", width)
                    .attr("height", height)
                    .attr("fill", toRgba(codex.bgHex, codex.transparencyPct));
            } else {
                this.backgroundRect.attr("width", width).attr("height", height).attr("fill", this.hcBackground);
            }

            // ─── Suite chrome: Border card + Corner Accents on the full-tile
            // root (this visual's sample-QA turn wiring — the shared modules
            // were vendored "source only" in the shared-sync pass). Border is
            // CSS on the root so it wraps everything the SVG paints (title is
            // an in-SVG <text>, so the background rect already covers it);
            // the corner overlay is refreshed to the theme accent per render.
            applyBorder(this.target, this.formattingSettings.visualBorder, {
                hcActive: this.isHighContrast,
                hcColor: this.hcForeground,
                palette: this.host.colorPalette,
                metadataObjects: undefined,
            });
            // Corner brackets are CHROME, not data: under Neon they take the
            // flare colour outright (scope "flare") and the card's glow budget
            // replaces the fixed dark-theme 55.
            applyCardSignature(this.cornerSignature, this.formattingSettings.cardSignature, {
                autoHex: neonColorFor(accentToken(theme), codex),
                hcActive: this.isHighContrast,
                hcColor: this.hcForeground,
                mirror: true,
                glowMix: this.isHighContrast ? 0 : codex.neon ? codex.glow : (theme === "dark" ? 55 : 0),
                muted: false,
            });
            if (width < 80 || height < 60) {
                this.titleEl.style("display", "none");
                this.altGroup.style("display", "none").selectAll("*").remove();
                this.gaugeGroup.style("display", "none");
                this.currentTooltipItems = [];
                this.currentSelectionId = null;
                this.svg.attr("aria-label", "Visual too small").attr("tabindex", null)
                    .attr("role", "img").style("cursor", "default");
                this.cornerSignature.elements.forEach(element => { element.style.display = "none"; });
                this.eventService.renderingFinished(options);
                return;
            }

            // ── Parse data ──────────────────────────────────────────────
            const parsed = this.parseData(dataView);

            if (parsed === null) {
                this.currentTooltipItems = [];
                // Empty state lives in gaugeGroup — make sure it's the
                // visible group even if the last render was an alt style.
                this.altGroup.style("display", "none").selectAll("*").remove();
                this.gaugeGroup.style("display", null);
                this.renderEmpty(width, height);
                this.eventService.renderingFinished(options);
                return;
            }

            this.emptyText.style("display", "none");

            // Capture selection ID for click-to-filter (1180.2.2.3)
            this.currentSelectionId = parsed.selectionId;
            const interactive = !!parsed.selectionId && this.host.hostCapabilities?.allowInteractions !== false;
            this.svg.style("cursor", interactive ? "pointer" : "default")
                .attr("tabindex", interactive ? 0 : null)
                .attr("role", interactive ? "button" : "img");

            // NOTE — do NOT attach a dataViewWildcard selector to Zone 3 Colour or
            // Value Colour. That pattern is for per-DATAPOINT colours: one slice per
            // category, each carrying `altConstantSelector: dataPoint.selectionId
            // .getSelector()` (formattingmodel README). Both of these are single
            // card-level settings on a single-value gauge, with no datapoint to bind
            // the constant to. With the wildcard and no alt-constant selector, Desktop
            // persisted a swatch pick through the wildcard, where metadata.objects
            // never sees it — so the pane accepted the colour and snapped back to the
            // default on the next update, and the render read a value that was never
            // written. Card-level (no selector) is what zones 1 and 2 have always
            // used, and it round-trips. See feedback_pbiviz_fx_wildcard_reverts_swatch.

            // ── Settings shortcuts ──────────────────────────────────────
            const titleCfg  = this.formattingSettings.titleSettingsCard;
            const gaugeCfg  = this.formattingSettings.gaugeSettingsCard;
            const zonesCfg  = this.formattingSettings.zonesCard;
            const targetCfg = this.formattingSettings.targetSettingsCard;
            const compCfg   = this.formattingSettings.comparisonSettingsCard;
            const valueCfg  = this.formattingSettings.valueDisplayCard;

            // ── Visual Title (iframe-internal, Policy 1180.2.5) ─────────
            const showTitle = !!titleCfg.showTitle.value && !!titleCfg.titleText.value;
            const titleFontSize = titleCfg.titleFontSize.value || 14;
            const titleHeight = showTitle ? titleFontSize + 14 : 0;
            if (showTitle) {
                const tAlign = String((titleCfg as any).titleAlign?.value || "left");
                const ta = textAlignFor(tAlign);
                const x = ta === "center" ? width / 2 : ta === "right" ? width - 8 : 8;
                const anchor = ta === "center" ? "middle" : ta === "right" ? "end" : "start";
                // Adaptive default (D-16 sentinel): untouched shared-Title navy
                // swaps to the dark text token on dark surfaces.
                // ...and the same swap when a Codex mode is FORCED: the mode
                // owns the title ink against its own surface, whether or not
                // the pane swatch was left on the shared-Title navy (#819).
                const setTitle = titleCfg.titleColor.value.value;
                const adaptiveTitle = inkOverride || setTitle === "#1a1a2e"
                    ? contrastInk(this.surface, "#000000", "#ffffff") : setTitle;
                this.titleEl
                    .attr("x", x)
                    .attr("y", titleFontSize + 4)
                    .attr("text-anchor", anchor)
                    .style("font-family", titleCfg.titleFontFamily.value || "Segoe UI, sans-serif")
                    .style("font-size", titleFontSize + "px")
                    .style("font-weight", titleCfg.titleBold.value ? "700" : "400")
                    .style("font-style", titleCfg.titleItalic.value ? "italic" : "normal")
                    .style("text-decoration", titleCfg.titleUnderline.value ? "underline" : "none")
                    .style("fill", this.isHighContrast ? this.hcForeground : adaptiveTitle)
                    .text(titleCfg.titleText.value)
                    .style("display", null);
                fitLabel(this.titleEl, Math.max(1, width - 16));
            } else {
                this.titleEl.style("display", "none");
            }

            // ── Scale bounds (NEXUS cycle-15 §1) ────────────────────────
            // Bound ends are used exactly as delivered. An UNBOUND end is
            // derived from the readings instead of falling back to the
            // invented 0–100 the visual used to assume — see derivedBounds().
            // A report that binds both wells is arithmetically untouched.
            const readings = [parsed.value, parsed.target, parsed.comparison]
                .filter((n): n is number => n !== null && isFinite(n));
            const derived = derivedBounds(readings);
            const minVal = parsed.min ?? derived.min;
            const maxVal = parsed.max ?? derived.max;

            // A SPAN IS WHATEVER THE REPORT SAYS IT IS (NEXUS cycle-15 §1).
            // This used to be `Math.max(max, min + 1)` — a one-unit floor that
            // could not tell a valid narrow domain from an invalid one. A real
            // 0–0.5 scale was silently doubled to 0–1, so every reading on it
            // was drawn at half its true position; reversed 100–0 became
            // 100–101 and equal 50–50 became 50–51, each of them an axis the
            // report never authored, carrying a needle pinned to one end and
            // no indication anything was wrong. Only min >= max is genuinely
            // undrawable, and that is now SAID rather than papered over.
            if (!(maxVal > minVal)) {
                this.currentTooltipItems = [];
                this.altGroup.style("display", "none").selectAll("*").remove();
                this.gaugeGroup.style("display", null);
                this.renderEmpty(width, height, "Visual_InvalidRange");
                this.eventService.renderingFinished(options);
                return;
            }

            // The measure's MODEL format string is the only thing that says what
            // unit these numbers are in, and the AXIS needs that as much as the
            // readout does (the readout formatter below reads the same two
            // consts). A percent format means Power BI is storing a fraction of
            // one: the reading 0.78 IS 78%, and round 1 made the readout say so
            // — but the scale under it still counted 0 … 1, so the tile showed
            // "78.0%" against an axis whose top was "1" (NEXUS cycle-15 §6, the
            // fraction/points confusion). Ticks now speak the readout's unit.
            const modelFmt = parsed.valueFormatString;
            const modelIsPercent = !!modelFmt && modelFmt.indexOf("%") >= 0;

            // Tick-label precision follows the SPAN. One decimal (the previous
            // fixed rule) prints "0 0.1 0.1 0.2 0.2" on a 0–0.5 scale now that
            // sub-unit domains render at their real extent — the same label
            // twice against two different ticks. Digits are added only when a
            // step finer than 0.1 needs them, so every scale that worked before
            // is formatted character-for-character as it was.
            const fmtScale = (v: number, tickCount: number): string => {
                const scale = modelIsPercent ? 100 : 1;
                const step = (tickCount > 1 ? Math.abs(maxVal - minVal) / (tickCount - 1) : Math.abs(maxVal - minVal)) * scale;
                const unit = Math.pow(10, scaleDigits(step));
                const shown = Math.round(v * scale * unit) / unit;
                return modelIsPercent ? `${shown}%` : String(shown);
            };
            // GEOMETRY vs READING (NEXUS cycle-15 §1). `currentVal` is clamped
            // because a needle cannot point past the end of its own scale.
            // `rawVal` is the measure as delivered and is what every NUMBER the
            // reader sees comes from — readout, tooltip and the ring's
            // completion arithmetic. Clamping the number instead of the pointer
            // overwrote the evidence: 150 on a 0–100 scale reported "100.0"
            // everywhere, including the tooltip, so the real reading could not
            // be recovered at all; a negative on a 0–100 scale read "0.0".
            const rawVal = parsed.value;
            const currentVal = clamp(rawVal, minVal, maxVal);

            // Zone boundaries clamped to scale range
            const zone1End = clamp(zonesCfg.zone1End.value, minVal, maxVal);
            const zone2End = clamp(zonesCfg.zone2End.value, zone1End, maxVal);

            // ─── Style dispatch (GAUGE-02/QA pivot 2026-07-17) ──────────
            // The remix is RETIRED (Neil: "do away with the remix") — the six
            // gallery instruments are the visual. Persisted legacy style
            // values (remix / unknown) map to the Pressure Dial default.
            // Value Arc card is pane-hidden on the two non-arc styles.
            let styleKey = String(this.formattingSettings.gaugeStyleCard.style.value.value || "pressureDial");
            if (["pressureDial", "speedometer", "tachometer", "progressRing", "segmentedMeter", "thermometer"].indexOf(styleKey) < 0) {
                styleKey = "pressureDial";
            }
            const isArcStyle = ["pressureDial", "speedometer", "tachometer", "progressRing"].indexOf(styleKey) >= 0;
            this.formattingSettings.valueArcCard.visible = isArcStyle;
            valueCfg.valueFormat.visible = styleKey !== "progressRing";
            // Per-style options surface only where they apply
            this.formattingSettings.gaugeStyleCard.segments.visible = styleKey === "segmentedMeter";
            this.formattingSettings.gaugeStyleCard.dialFace.visible = styleKey === "speedometer" || styleKey === "tachometer";

            {
                this.gaugeGroup.style("display", "none");
                this.altGroup.style("display", null);

                // Model formats supply units and precision unless the author explicitly sets digits.
                const vfmt = valueCfg.valueFormat.value.value as string;
                const requestedDecimals = valueCfg.decimalPlaces.value;
                const vdec = Number.isFinite(requestedDecimals)
                    ? Math.max(0, Math.min(15, Math.round(requestedDecimals)))
                    : DECIMAL_PLACES_DEFAULT;
                const modelCarriesUnit = modelIsPercent || (!!modelFmt && /[$£€¥]/.test(modelFmt));
                const decIsExplicit = Object.prototype.hasOwnProperty.call(
                    dataView?.metadata?.objects?.valueDisplay || {}, "decimalPlaces");
                const unitFmt = modelFmt && decIsExplicit
                    ? withFractionDigits(modelFmt, vdec)
                    : modelFmt;
                const fmtV = (n: number) => vfmt === "percent" && !modelCarriesUnit
                    ? n.toFixed(vdec) + "%"
                    : unitFmt ? formatModelNumber(n, unitFmt, this.host.locale) : n.toFixed(vdec);
                const fmtOther = (n: number, format: string | null) => format
                    ? formatModelNumber(n, format, this.host.locale) : n.toFixed(vdec);

                const hcC = this.isHighContrast;
                const dangerClr  = hcC ? this.hcForeground : zonesCfg.zone1Color.value.value;
                const warningClr = hcC ? this.hcForeground : zonesCfg.zone2Color.value.value;
                // Zone 3 reads its slice EXACTLY like zones 1 and 2. It used to be
                // routed through a dataViewWildcard selector + ColorHelper, which is
                // the per-DATAPOINT pattern (one slice per category, bound to that
                // datapoint's selectionId — see the formattingmodel README). Zone 3 is
                // a single card-level setting on a single-value gauge, so the wildcard
                // sent swatch edits somewhere metadata.objects never sees: the pane
                // accepted a pick then snapped straight back to the default on the next
                // update (Neil 2026-07-28). No selector = card-level persistence = it
                // sticks, which is why the two sibling zones always worked.
                const successClr = hcC ? this.hcForeground : zonesCfg.zone3Color.value.value;

                // ── Band model ──────────────────────────────────────────────
                // "thresholds" (default, unchanged): ascending cuts up the
                // scale, higher-is-better. "targetRelative": tolerance bands
                // measured FROM the target, so a value is judged by how far off
                // target it is in EITHER direction. The target-relative model
                // emits FIVE bands (danger/warning/success/warning/danger) —
                // renderers resolve zones by lookup, not by index, so the extra
                // entries need no renderer change. dangerSpans() handles the two
                // disjoint danger runs.
                const bandingMode = String(zonesCfg.bandingMode.value?.value || "thresholds");
                const targetVal = parsed.target;
                let zones: GaugeZone[];
                let activeZone: Pick<GaugeZone, "band" | "color">;
                if (bandingMode === "targetRelative" && targetVal == null) {
                    this.currentTooltipItems = [];
                    this.altGroup.style("display", "none").selectAll("*").remove();
                    this.gaugeGroup.style("display", null);
                    this.renderEmpty(width, height, "Visual_TargetRequired");
                    this.eventService.renderingFinished(options);
                    return;
                }
                if (bandingMode === "targetRelative" && targetVal != null && isFinite(targetVal)) {
                    // Tolerances are % OF TARGET, so the bands scale with the
                    // measure instead of being pinned to the axis.
                    const innerPct = Math.max(0, Number(zonesCfg.onTargetTolerance.value) || 0) / 100;
                    const outerRaw = Math.max(0, Number(zonesCfg.warningTolerance.value) || 0) / 100;
                    // Warning must sit OUTSIDE on-target; if mis-set, collapse the
                    // amber band rather than invert it.
                    const outerPct = Math.max(innerPct, outerRaw);
                    const mag = Math.abs(targetVal);
                    // Classification uses the raw reading, independently of clipped/zero-width arcs.
                    const distance = Math.abs(rawVal - targetVal);
                    const epsilon = Number.EPSILON * Math.max(Math.abs(rawVal), mag) * 8;
                    activeZone = distance <= innerPct * mag + epsilon
                        ? { band: "success", color: successClr }
                        : distance <= outerPct * mag + epsilon
                            ? { band: "warning", color: warningClr }
                            : { band: "danger", color: dangerClr };
                    const lo2 = targetVal - outerPct * mag, lo1 = targetVal - innerPct * mag;
                    const hi1 = targetVal + innerPct * mag, hi2 = targetVal + outerPct * mag;
                    const clamp = (n: number) => Math.min(maxVal, Math.max(minVal, n));
                    const trBands: GaugeZone[] = [
                        { from: minVal,      to: clamp(lo2), band: "danger",  color: dangerClr  },
                        { from: clamp(lo2),  to: clamp(lo1), band: "warning", color: warningClr },
                        { from: clamp(lo1),  to: clamp(hi1), band: "success", color: successClr },
                        { from: clamp(hi1),  to: clamp(hi2), band: "warning", color: warningClr },
                        { from: clamp(hi2),  to: maxVal,     band: "danger",  color: dangerClr  },
                    ];
                    zones = trBands.filter(z => z.to > z.from);
                } else {
                    // POLARITY: thresholds bake in higher-is-better (zone 1 =
                    // danger at the bottom). "Lower is better" swaps the two
                    // outer bands AND their colours together, so an error-rate
                    // or cost measure shows green at the low end instead of
                    // rendering its meaning backwards. The boundaries the user
                    // authored are untouched — only which end is good flips.
                    const lowGood = String(zonesCfg.polarity.value?.value || "higherIsBetter") === "lowerIsBetter";
                    zones = [
                        { from: minVal, to: zone1End,
                          band: lowGood ? "success" : "danger",
                          color: lowGood ? successClr : dangerClr },
                        { from: zone1End, to: zone2End, band: "warning", color: warningClr },
                        { from: zone2End, to: maxVal,
                          band: lowGood ? "danger" : "success",
                          color: lowGood ? dangerClr : successClr },
                    ];
                    activeZone = zones.find(z => rawVal >= z.from && rawVal <= z.to)
                        ?? zones[rawVal < minVal ? 0 : zones.length - 1];
                }
                const vaCfg = this.formattingSettings.valueArcCard;
                const tCfg = this.formattingSettings.targetSettingsCard;
                const cCfg = this.formattingSettings.comparisonSettingsCard;
                // Auto-sentinels: a picker left on its declared default means
                // "board/theme token"; an explicit change wins (D-16 idiom).
                const tClr = tCfg.targetColor.value.value;
                const cClr = cCfg.comparisonColor.value.value;
                const ctx: GaugeRenderCtx = {
                    group: this.altGroup.node() as SVGGElement,
                    defs: this.defs.node() as SVGDefsElement,
                    width, height: height - (hcC ? 20 : 0), titleHeight,
                    theme, surface: this.surface, hc: hcC, hcFg: this.hcForeground, hcBg: this.hcBackground,
                    min: minVal, max: maxVal, value: currentVal, rawValue: rawVal,
                    target: parsed.target,
                    showTarget: !!tCfg.showTarget.value,
                    decimalPlaces: Math.max(0, Math.min(15, Math.round(vdec) || 0)),
                    comparison: cCfg.showComparison.value ? parsed.comparison : null,
                    valueText: fmtV(rawVal),
                    scaleText: fmtScale,
                    unitText: parsed.categoryLabel || "",
                    showValue: !!valueCfg.showValue.value,
                    showUnit: !!valueCfg.showLabel.value,
                    // Read the slice directly, same as every other colour on this
                    // card. This used to go through a dataViewWildcard selector +
                    // ColorHelper, which broke it twice over: the wildcard meant a
                    // swatch pick never landed in metadata.objects (so the pane
                    // reverted AND the guard that gated the helper could never fire),
                    // and getColorForMeasure never returns "" so it had to be gated at
                    // all. Empty = unset, so the zone/needle colour still wins.
                    // TEXT inks, so a forced Codex mode owns them (#819): an
                    // explicit pane pick collapses to the canvas ink derived
                    // from the Codex surface, exactly as an untouched ("")
                    // swatch already did. "Match Needle Colour" is not a
                    // colour choice — it says "follow the data" — so it keeps
                    // working in every mode.
                    valueColor: inkOverride ? null : (valueCfg.valueColor.value.value || null),
                    unitColor: inkOverride ? null : (valueCfg.labelColor.value.value || null),
                    needleColor: valueCfg.needleColor.value.value || null,
                    matchNeedleColor: !!valueCfg.matchNeedleColor.value,
                    lowerIsBetter: String(zonesCfg.polarity.value?.value || "higherIsBetter") === "lowerIsBetter",
                    targetColor: (tClr && tClr !== targetToken("light")) ? tClr : null,
                    comparisonColor: (cClr && cClr !== "#5e5d5a") ? cClr : null,
                    valueFont: {
                        family: valueCfg.valueFontFamily.value || null,
                        size: valueCfg.valueFontSize.value || null,
                        bold: !!valueCfg.valueBold.value,
                        italic: !!valueCfg.valueItalic.value,
                        underline: !!valueCfg.valueUnderline.value,
                    },
                    unitFont: {
                        family: valueCfg.labelFontFamily.value || null,
                        size: valueCfg.labelFontSize.value || null,
                        bold: !!valueCfg.labelBold.value,
                        italic: !!valueCfg.labelItalic.value,
                        underline: !!valueCfg.labelUnderline.value,
                    },
                    zones, activeZone,
                    valueArc: {
                        style: String(vaCfg.arcStyle.value.value || "overlay") as "overlay" | "band" | "hidden",
                        opacity: vaCfg.opacity.value ?? 100,
                        ringColor: vaCfg.ringColor.value.value || null,
                    },
                    segments: this.formattingSettings.gaugeStyleCard.segments.value ?? 18,
                    dialFace: String(this.formattingSettings.gaugeStyleCard.dialFace.value?.value || "auto"),
                    // ONE resolved theme for all five instruments (#819).
                    codex,
                };
                switch (styleKey) {
                    case "pressureDial": renderPressureDial(ctx); break;
                    case "speedometer": renderSpeedometer(ctx); break;
                    case "tachometer": renderTachometer(ctx); break;
                    case "progressRing": renderProgressRing(ctx); break;
                    case "segmentedMeter": renderSegmentedMeter(ctx); break;
                    case "thermometer": renderThermometer(ctx); break;
                }
                const zoneLabel = { success: "Healthy", warning: "Warning", danger: "Critical" }[activeZone.band];
                if (hcC) {
                    const stateText = this.altGroup.append("text").attr("class", "zone-state")
                        .attr("x", width / 2).attr("y", height - 8).attr("text-anchor", "middle")
                        .attr("fill", this.hcForeground).style("font-size", "12px").text(zoneLabel);
                    fitLabel(stateText, width - 16);
                }
                this.previousValue = currentVal;

                // The tooltip is the last place an out-of-range reading could be
                // recovered, so it reports the raw measure, never the clamp.
                this.currentTooltipItems = [{ displayName: "Value", value: fmtV(rawVal) }];
                if (bandingMode === "targetRelative" && targetVal === 0) {
                    this.currentTooltipItems.push({
                        displayName: "Banding",
                        value: "Percent tolerances of zero are zero; only exact target is on target.",
                    });
                }
                if (rawVal < minVal || rawVal > maxVal) {
                    this.currentTooltipItems.push({
                        displayName: "Range",
                        value: rawVal < minVal ? `Below minimum ${fmtV(minVal)}` : `Above maximum ${fmtV(maxVal)}`,
                    });
                }
                if (parsed.categoryLabel) this.currentTooltipItems.push({ displayName: "Category", value: parsed.categoryLabel });
                if (parsed.target !== null) this.currentTooltipItems.push({ displayName: "Target", value: fmtOther(parsed.target, parsed.targetFormatString) });
                if (parsed.comparison !== null) this.currentTooltipItems.push({ displayName: "Comparison", value: fmtOther(parsed.comparison, parsed.comparisonFormatString) });
                this.currentTooltipItems.push({ displayName: "Zone", value: zoneLabel });
                this.svg.attr("aria-label", this.currentTooltipItems.map(item => `${item.displayName}: ${item.value}`).join(". "));

                this.eventService.renderingFinished(options);
                return;
            }
        } catch (e) {
            this.eventService.renderingFailed(options, String(e));
        }
    }

    // ── Helpers ──────────────────────────────────────────────────────────

    /** Build a vertical linearGradient (lighter top, base colour bottom) for a zone fill */
    private buildZoneGradient(id: string, baseColor: string): void {
        const grad = this.defs.append("linearGradient")
            .attr("id", id)
            .attr("x1", "0%").attr("y1", "0%")
            .attr("x2", "0%").attr("y2", "100%");
        grad.append("stop").attr("offset", "0%")
            .attr("stop-color", this.lighten(baseColor, 0.18))
            .attr("stop-opacity", "1");
        grad.append("stop").attr("offset", "100%")
            .attr("stop-color", baseColor)
            .attr("stop-opacity", "1");
    }

    /** Pick black or white text for legibility on a given background hex */
    private contrastTextColor(hex: string): string {
        try {
            const m = /^#?([a-f0-9]{6})$/i.exec(hex);
            if (!m) return "#1a1a2e";
            const num = parseInt(m[1], 16);
            const r = (num >> 16) & 0xff;
            const g = (num >> 8) & 0xff;
            const b = num & 0xff;
            // Relative luminance per WCAG approximation
            const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
            return lum > 0.55 ? "#1a1a2e" : "#ffffff";
        } catch {
            return "#1a1a2e";
        }
    }

    /** Lighten a hex colour towards white by amt (0..1) */
    private lighten(hex: string, amt: number): string {
        try {
            const m = /^#?([a-f0-9]{6})$/i.exec(hex);
            if (!m) return hex;
            const num = parseInt(m[1], 16);
            const r = (num >> 16) & 0xff;
            const g = (num >> 8) & 0xff;
            const b = num & 0xff;
            const mix = (c: number) => Math.round(c + (255 - c) * amt);
            return `#${[mix(r), mix(g), mix(b)].map(c => c.toString(16).padStart(2, "0")).join("")}`;
        } catch {
            return hex;
        }
    }

    /** Draw a static arc segment */
    private drawArc(
        pathSel: Selection<SVGPathElement, unknown, null, undefined>,
        arcGen: any,
        innerRadius: number,
        outerRadius: number,
        sa: number,
        ea: number,
        fill: string,
        opacity: number
    ): void {
        pathSel
            .attr("d", arcGen({ innerRadius, outerRadius, startAngle: sa, endAngle: ea }))
            .attr("fill", fill)
            .attr("opacity", opacity)
            .style("display", null);
    }

    /** Parse value, target, comparison, min, max from categorical dataView by role name */
    private parseData(dataView: DataView): ParsedData | null {
        if (!dataView || !dataView.categorical || !dataView.categorical.values) {
            return null;
        }

        const columns = dataView.categorical.values;
        let value: number | null = null;
        let target: number | null = null;
        let comparison: number | null = null;
        let min: number | null = null;
        let max: number | null = null;
        let valueFormatString: string | null = null;
        let targetFormatString: string | null = null;
        let comparisonFormatString: string | null = null;

        for (let i = 0; i < columns.length; i++) {
            const roles = columns[i].source.roles;
            const raw = columns[i].values[0];

            if (roles && roles["value"]) {
                value = this.toNum(raw);
                valueFormatString = columns[i].source.format || null;
            }
            if (roles && roles["target"]) {
                target = this.toNum(raw);
                targetFormatString = columns[i].source.format || null;
            }
            if (roles && roles["comparison"]) {
                comparison = this.toNum(raw);
                comparisonFormatString = columns[i].source.format || null;
            }
            if (roles && roles["minimum"]) {
                min = this.toNum(raw);
            }
            if (roles && roles["maximum"]) {
                max = this.toNum(raw);
            }
        }

        if (value === null) return null;

        // Pull the (optional) category for filter-out + tooltip context
        let categoryLabel: string | null = null;
        let selectionId: ISelectionId | null = null;
        const categories = dataView.categorical.categories;
        if (categories && categories.length > 0 && categories[0].values && categories[0].values.length > 0) {
            const cat = categories[0];
            const raw = cat.values[0];
            categoryLabel = raw == null ? null : String(raw);
            try {
                selectionId = this.host.createSelectionIdBuilder()
                    .withCategory(cat, 0)
                    .createSelectionId();
            } catch {
                selectionId = null;
            }
        }

        return {
            value,
            target,
            comparison,
            min,
            max,
            valueFormatString,
            targetFormatString,
            comparisonFormatString,
            categoryLabel,
            selectionId
        };
    }

    /** Coerce a delivered cell to a READING — or null when there is no reading.
     *
     *  MISSING IS NOT ZERO. `Number("")` and `Number("   ")` are both 0, so a
     *  blank or whitespace cell used to be asserted as a real measurement: the
     *  gauge drew a needle at the bottom of the scale and printed "0.0" for a
     *  row that carried nothing (NEXUS cycle-15 §6). A blank now takes the same
     *  empty-state path that null and non-numeric text already took.
     *
     *  A READING HAS TO BE FINITE. `Number("Infinity")` is not NaN, so the old
     *  isNaN guard let non-finite values through: an infinite minimum produced
     *  NaN tick labels and NaN path geometry, and because nothing threw, no
     *  rendering-failed event was raised either — the tile just showed nonsense.
     *  isFinite() rejects NaN and ±Infinity together.
     */
    private toNum(raw: any): number | null {
        if (raw == null) return null;
        if (typeof raw === "string" && raw.trim() === "") return null;
        const n = Number(raw);
        return isFinite(n) ? n : null;
    }

    /** Empty state — also the VALIDATION state. `messageKey` names the string
     *  to show: the default "drop a measure here" prompt, or a specific reason
     *  the gauge cannot be drawn (an unusable Minimum/Maximum pair). The reason
     *  is shown rather than an invented axis (NEXUS cycle-15 §1). */
    private renderEmpty(width: number, height: number, messageKey = "Visual_EmptyText"): void {
        this.titleEl.style("display", "none");
        this.borderPath.style("display", "none");
        this.zone1Path.style("display", "none");
        this.zone2Path.style("display", "none");
        this.zone3Path.style("display", "none");
        this.valuePath.style("display", "none");
        this.targetLine.style("display", "none");
        this.targetNeedle.style("display", "none");
        this.needleHub.style("display", "none");
        this.targetMarker.style("display", "none");
        this.compLine.style("display", "none");
        this.compMarker.style("display", "none");
        this.zone1Label.style("display", "none");
        this.zone2Label.style("display", "none");
        this.zone3Label.style("display", "none");
        this.valueText.style("display", "none");
        this.labelText.style("display", "none");
        this.previousValueAngle = null;
        this.previousValue = null;
        this.currentSelectionId = null;
        this.svg.attr("tabindex", null).attr("role", "img")
            .attr("aria-label", this.localizationManager.getDisplayName(messageKey))
            .style("cursor", "default");

        this.gaugeGroup.attr("transform", `translate(${width / 2},${height / 2})`);
        this.emptyText
            .attr("x", 0)
            .attr("y", 0)
            .attr("text-anchor", "middle")
            .attr("dominant-baseline", "middle")
            .style("font-size", "14px")
            .style("fill", this.isHighContrast ? this.hcForeground
                : mutedInk(contrastInk(this.surface, "#000000", "#ffffff"), this.surface))
            .text(this.localizationManager.getDisplayName(messageKey))
            .style("display", null);
        fitText(this.emptyText, Math.max(1, width - 16), Math.max(1, height - 16));
    }

    public destroy(): void {
        if (this.destroyed) return;
        // Drop the in-flight licence check FIRST: its redraw callback replays
        // update() against a torn-down target otherwise (NEXUS lifecycle finding).
        this.licenseGate.dispose();
        this.destroyed = true;
        this.lastUpdateOptions = null;
        this.currentTooltipItems = [];
        this.tooltipService.hide({ isTouchEvent: false, immediately: true });
        this.target.removeEventListener("contextmenu", this.onContextMenu);
        this.target.removeEventListener("mousemove", this.onMouseMove);
        this.target.removeEventListener("mouseleave", this.onMouseLeave);
        this.cornerSignature?.destroy();
        this.cornerSignature = null;
        // Clean up DOM refs and event listeners
        if (this.svg) {
            this.svg.on("click", null).on("keydown", null).remove();
        }
        this.target = null;
        this.svg = null;
        this.defs = null;
        this.titleEl = null;
        this.gaugeGroup = null;
        this.altGroup = null;
        this.zoneSegGroup = null;
        this.needleHubInner = null;
        this.backgroundRect = null;
        this.borderPath = null;
        this.zone1Path = null;
        this.zone2Path = null;
        this.zone3Path = null;
        this.valuePath = null;
        this.targetLine = null;
        this.targetNeedle = null;
        this.needleHub = null;
        this.targetMarker = null;
        this.compLine = null;
        this.compMarker = null;
        this.zone1Label = null;
        this.zone2Label = null;
        this.zone3Label = null;
        this.valueText = null;
        this.labelText = null;
        this.emptyText = null;
        this.currentSelectionId = null;
    }

    public getFormattingModel(): powerbi.visuals.FormattingModel {
        this.formattingSettings.codexTheme.reveal();
        return this.formattingSettingsService.buildFormattingModel(this.formattingSettings);
    }
}
