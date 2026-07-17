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

import { dataViewWildcard } from "powerbi-visuals-utils-dataviewutils";
import { ColorHelper } from "powerbi-visuals-utils-colorutils";
import { toRgba } from "./shared/colorHelpers";
import { Theme, accentToken, targetToken } from "./shared/bandEngine";
import { surfaceTokens } from "./shared/designTokens";
import { makeCornerBrackets, CardSignatureHandle } from "./shared/cardSignature";
import { applyCardSignature } from "./shared/cardSignatureSettings";
import { applyBorder } from "./shared/borderSettings";
import { GaugeRenderCtx, GaugeZone } from "./renderers/helpers";
import { renderPressureDial, renderSpeedometer, renderTachometer } from "./renderers/dialFamily";
import { renderProgressRing } from "./renderers/ring";
import { renderSegmentedMeter } from "./renderers/meter";
import { renderThermometer } from "./renderers/thermometer";

/** Luminance-based theme pick (matches the pbiKpiCard v3 pilot's own
 * 0.55 threshold convention) — this visual's Background Colour default
 * is opaque white even though the overlay itself defaults transparent
 * (transparency 100), so the configured HEX is still a reliable
 * authorial-intent signal for the needle's theme-aware fallback below. */
function themeFor(hex: string): Theme {
    const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})/i.exec(hex || "");
    if (!m) return "light";
    const r = parseInt(m[1], 16), g = parseInt(m[2], 16), b = parseInt(m[3], 16);
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luminance < 0.5 ? "dark" : "light";
}

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

interface ParsedData {
    value: number;
    target: number | null;
    comparison: number | null;
    min: number;
    max: number;
    categoryLabel: string | null;
    selectionId: ISelectionId | null;
}

export class Visual implements IVisual {
    private target: HTMLElement;
    private host: IVisualHost;
    private eventService: IVisualEventService;
    private selectionManager: ISelectionManager;
    private localizationManager: ILocalizationManager;
    private formattingSettings: VisualFormattingSettingsModel;
    private formattingSettingsService: FormattingSettingsService;

    private tooltipService: ITooltipService;

    // Tooltip data for current render
    private currentTooltipItems: VisualTooltipDataItem[] = [];

    // High contrast support
    private isHighContrast: boolean = false;
    private hcForeground: string = "";
    private hcBackground: string = "";

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

    // Conditional formatting (fx) state — Zone 3 (Success) Colour (TRANS-04)
    private zone3ColorHelper: ColorHelper | null = null;

    // Conditional formatting (fx) state — Value readout Colour (TEXT-02)
    private valueColorHelper: ColorHelper | null = null;

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

    constructor(options: VisualConstructorOptions) {
        this.formattingSettingsService = new FormattingSettingsService();
        this.target = options.element;
        this.host = options.host;
        this.eventService = options.host.eventService;
        this.selectionManager = options.host.createSelectionManager();
        this.localizationManager = options.host.createLocalizationManager();
        this.tooltipService = options.host.tooltipService;

        // Context menu on right-click
        this.target.addEventListener("contextmenu", (e: MouseEvent) => {
            this.selectionManager.showContextMenu({}, { x: e.clientX, y: e.clientY });
            e.preventDefault();
        });

        // Tooltip on hover
        this.target.addEventListener("mousemove", (e: MouseEvent) => {
            if (this.currentTooltipItems.length > 0) {
                this.tooltipService.show({
                    coordinates: [e.clientX, e.clientY],
                    isTouchEvent: false,
                    dataItems: this.currentTooltipItems,
                    identities: []
                });
            }
        });
        this.target.addEventListener("mouseleave", () => {
            this.tooltipService.hide({ isTouchEvent: false, immediately: false });
        });

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
        this.cornerSignature = makeCornerBrackets(
            this.target,
            accentToken("dark"),
            { variant: "cornerBracket", mirror: true }
        );

        // Click-to-filter (1180.2.2.3 Filter Out)
        this.svg.on("click", (e: MouseEvent) => {
            if (this.currentSelectionId) {
                this.selectionManager.select(this.currentSelectionId, e.ctrlKey || e.metaKey);
                e.stopPropagation();
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
        this.eventService.renderingStarted(options);

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
            const styleSlice = this.formattingSettings.gaugeStyleCard.style;
            if (!styleSlice.value) styleSlice.value = styleSlice.items[0];

            // v3 theme pick (01-18 Task 4, audit-board polish) — drives the
            // needle's theme-aware default fallback below. Scope guard: this
            // is the ONLY new engine-level primitive Task 4 introduces; no
            // dome/face/hub/six-style rebuild (Phase 3, GAUGE-02/03).
            const theme: Theme = themeFor(this.formattingSettings.background.backgroundColor.value?.value ?? "#ffffff");

            const width = options.viewport.width;
            const height = options.viewport.height;

            this.svg.attr("width", width).attr("height", height);

            // ─── Dedicated background layer (D-05) ─────────────────────
            // First child of the SVG, behind the gauge group. Never
            // whole-root opacity. Transparency default is overridden to
            // 100 in settings.ts (this visual's SVG was never painted
            // before this plan — fully transparent), so an OLD saved
            // report renders alpha 0, pixel-identical, per D-06.
            if (!this.isHighContrast) {
                const background = this.formattingSettings.background;
                const bgHex = background.backgroundColor.value?.value ?? "#ffffff";
                const bgTransparencyPct = background.transparency.value ?? 100;
                this.backgroundRect
                    .attr("width", width)
                    .attr("height", height)
                    .attr("fill", toRgba(bgHex, bgTransparencyPct));
            } else {
                this.backgroundRect.attr("fill", "none");
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
            applyCardSignature(this.cornerSignature, this.formattingSettings.cardSignature, {
                autoHex: accentToken(theme),
                hcActive: this.isHighContrast,
                hcColor: this.hcForeground,
                mirror: true,
                glowMix: this.isHighContrast ? 0 : (theme === "dark" ? 55 : 0),
                muted: false,
            });

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
            this.svg.style("cursor", parsed.selectionId ? "pointer" : "default");

            // ─── Conditional formatting (fx) wiring — Zone 3 (Success)
            // Colour (TRANS-04). A bare `instanceKind: ConstantOrRule`
            // declaration in settings.ts does not make the fx button
            // functional on its own (Pitfall 5) — it also needs a
            // `selector` (dataViewWildcard) and an `altConstantSelector`
            // bound to a concrete selectionId. Resolved via
            // ColorHelper.getColorForMeasure at the existing z3Color read
            // site below (single-value visual, matching the pbiKpiCard
            // reference pattern) — no other zone/needle/hub/callout code
            // touched (Task 3 scope guard).
            const zone3ColorSlice = this.formattingSettings.zonesCard.zone3Color;
            zone3ColorSlice.selector = dataViewWildcard.createDataViewWildcardSelector(
                dataViewWildcard.DataViewWildcardMatchingOption.InstancesAndTotals
            );
            zone3ColorSlice.altConstantSelector = undefined; // card-level constant persistence: swatch edits apply to ALL instances + round-trip into the pane (first-instance binding persisted a row-0-only override); fx rules stay per-instance via the wildcard selector;
            this.zone3ColorHelper = new ColorHelper(
                this.host.colorPalette,
                { objectName: "zones", propertyName: "zone3Color" },
                zone3ColorSlice.value.value
            );

            // ─── Conditional formatting (fx) wiring — Value readout
            // Colour (TEXT-02). Same wildcard-selector + altConstantSelector
            // + ColorHelper.getColorForMeasure pattern as Zone 3 Colour
            // above, targeting the "value" measure role. Resolved at the
            // existing effectiveValueColor read site below — no other
            // zone/needle/hub/callout code touched (Task 3 scope guard).
            const valueColorSlice = this.formattingSettings.valueDisplayCard.valueColor;
            valueColorSlice.selector = dataViewWildcard.createDataViewWildcardSelector(
                dataViewWildcard.DataViewWildcardMatchingOption.InstancesAndTotals
            );
            valueColorSlice.altConstantSelector = undefined; // card-level constant persistence: swatch edits apply to ALL instances + round-trip into the pane (first-instance binding persisted a row-0-only override); fx rules stay per-instance via the wildcard selector;
            this.valueColorHelper = new ColorHelper(
                this.host.colorPalette,
                { objectName: "valueDisplay", propertyName: "valueColor" },
                valueColorSlice.value.value
            );

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
                const setTitle = titleCfg.titleColor.value.value;
                const adaptiveTitle = setTitle === "#1a1a2e" && theme === "dark"
                    ? surfaceTokens("dark").text : setTitle;
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
            } else {
                this.titleEl.style("display", "none");
            }

            const minVal = parsed.min;
            const maxVal = Math.max(parsed.max, minVal + 1); // prevent zero-range
            const currentVal = clamp(parsed.value, minVal, maxVal);

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
            // Per-style options surface only where they apply
            this.formattingSettings.gaugeStyleCard.segments.visible = styleKey === "segmentedMeter";
            this.formattingSettings.gaugeStyleCard.dialFace.visible = styleKey === "speedometer" || styleKey === "tachometer";

            {
                this.gaugeGroup.style("display", "none");
                this.altGroup.style("display", null);

                const vfmt = valueCfg.valueFormat.value.value as string;
                const vdec = valueCfg.decimalPlaces.value;
                const fmtV = (n: number) => vfmt === "percent" ? n.toFixed(vdec) + "%" : n.toFixed(vdec);

                const hcC = this.isHighContrast;
                const zones: GaugeZone[] = [
                    { from: minVal, to: zone1End, band: "danger", color: hcC ? this.hcForeground : zonesCfg.zone1Color.value.value },
                    { from: zone1End, to: zone2End, band: "warning", color: hcC ? this.hcForeground : zonesCfg.zone2Color.value.value },
                    { from: zone2End, to: maxVal, band: "success", color: hcC ? this.hcForeground : zonesCfg.zone3Color.value.value },
                ];
                const vaCfg = this.formattingSettings.valueArcCard;
                const tCfg = this.formattingSettings.targetSettingsCard;
                const cCfg = this.formattingSettings.comparisonSettingsCard;
                // Auto-sentinels: a picker left on its declared default means
                // "board/theme token"; an explicit change wins (D-16 idiom).
                const tClr = tCfg.targetColor.value.value;
                const cClr = cCfg.comparisonColor.value.value;
                const fxValueClr = this.valueColorHelper?.getColorForMeasure(dataView?.metadata?.objects, "value") ?? "";
                const ctx: GaugeRenderCtx = {
                    group: this.altGroup.node() as SVGGElement,
                    defs: this.defs.node() as SVGDefsElement,
                    width, height, titleHeight,
                    theme, hc: hcC, hcFg: this.hcForeground, hcBg: this.hcBackground,
                    min: minVal, max: maxVal, value: currentVal,
                    target: tCfg.showTarget.value ? parsed.target : null,
                    comparison: cCfg.showComparison.value ? parsed.comparison : null,
                    valueText: fmtV(currentVal),
                    unitText: parsed.categoryLabel || "",
                    showValue: !!valueCfg.showValue.value,
                    showUnit: !!valueCfg.showLabel.value,
                    valueColor: (fxValueClr || valueCfg.valueColor.value.value || "") || null,
                    unitColor: valueCfg.labelColor.value.value || null,
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
                    zones,
                    valueArc: {
                        style: String(vaCfg.arcStyle.value.value || "overlay") as "overlay" | "band" | "hidden",
                        opacity: vaCfg.opacity.value ?? 100,
                    },
                    segments: this.formattingSettings.gaugeStyleCard.segments.value ?? 18,
                    dialFace: String(this.formattingSettings.gaugeStyleCard.dialFace.value?.value || "auto"),
                };
                switch (styleKey) {
                    case "pressureDial": renderPressureDial(ctx); break;
                    case "speedometer": renderSpeedometer(ctx); break;
                    case "tachometer": renderTachometer(ctx); break;
                    case "progressRing": renderProgressRing(ctx); break;
                    case "segmentedMeter": renderSegmentedMeter(ctx); break;
                    case "thermometer": renderThermometer(ctx); break;
                }
                this.previousValue = currentVal;

                this.currentTooltipItems = [{ displayName: "Value", value: fmtV(currentVal) }];
                if (parsed.categoryLabel) this.currentTooltipItems.push({ displayName: "Category", value: parsed.categoryLabel });
                if (parsed.target !== null) this.currentTooltipItems.push({ displayName: "Target", value: fmtV(parsed.target) });
                if (parsed.comparison !== null) this.currentTooltipItems.push({ displayName: "Comparison", value: fmtV(parsed.comparison) });

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

        for (let i = 0; i < columns.length; i++) {
            const roles = columns[i].source.roles;
            const raw = columns[i].values[0];

            if (roles && roles["value"]) {
                value = this.toNum(raw);
            }
            if (roles && roles["target"]) {
                target = this.toNum(raw);
            }
            if (roles && roles["comparison"]) {
                comparison = this.toNum(raw);
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
            min: min ?? 0,
            max: max ?? 100,
            categoryLabel,
            selectionId
        };
    }

    /** Safely coerce to number */
    private toNum(raw: any): number | null {
        if (raw == null) return null;
        const n = Number(raw);
        return isNaN(n) ? null : n;
    }

    /** Empty state */
    private renderEmpty(width: number, height: number): void {
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

        this.gaugeGroup.attr("transform", `translate(${width / 2},${height / 2})`);
        this.emptyText
            .attr("x", 0)
            .attr("y", 0)
            .attr("text-anchor", "middle")
            .attr("dominant-baseline", "middle")
            .style("font-size", "14px")
            .style("fill", this.isHighContrast ? this.hcForeground : "#999999")
            .text(this.localizationManager.getDisplayName("Visual_EmptyText"))
            .style("display", null);
    }

    public destroy(): void {
        // Clean up DOM refs and event listeners
        if (this.svg) {
            this.svg.remove();
        }
        this.target = null;
        this.svg = null;
        this.defs = null;
        this.titleEl = null;
        this.gaugeGroup = null;
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
        return this.formattingSettingsService.buildFormattingModel(this.formattingSettings);
    }
}
