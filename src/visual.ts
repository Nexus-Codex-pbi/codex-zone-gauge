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
import { Theme } from "./shared/bandEngine";

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
    private gaugeGroup: Selection<SVGGElement, unknown, null, undefined>;

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

        // Root SVG fills the Power BI tile
        this.svg = select(this.target)
            .append("svg")
            .classed("zone-gauge-svg", true);

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

        // Border arc (behind everything)
        this.borderPath = this.gaugeGroup.append("path").classed("border-arc", true);

        // Zone background arcs (drawn at reduced opacity)
        this.zone1Path = this.gaugeGroup.append("path").classed("zone-arc zone-1", true);
        this.zone2Path = this.gaugeGroup.append("path").classed("zone-arc zone-2", true);
        this.zone3Path = this.gaugeGroup.append("path").classed("zone-arc zone-3", true);

        // Value overlay arc (full opacity, slightly inset)
        this.valuePath = this.gaugeGroup.append("path").classed("value-arc", true);

        // Value needle (tachometer style, from centre)
        this.targetNeedle = this.gaugeGroup.append("path").classed("value-needle", true);
        this.needleHub = this.gaugeGroup.append("circle").classed("needle-hub", true);

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

            // ── Parse data ──────────────────────────────────────────────
            const parsed = this.parseData(dataView);

            if (parsed === null) {
                this.currentTooltipItems = [];
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
                this.titleEl
                    .attr("x", x)
                    .attr("y", titleFontSize + 4)
                    .attr("text-anchor", anchor)
                    .style("font-family", titleCfg.titleFontFamily.value || "Segoe UI, sans-serif")
                    .style("font-size", titleFontSize + "px")
                    .style("font-weight", titleCfg.titleBold.value ? "700" : "400")
                    .style("font-style", titleCfg.titleItalic.value ? "italic" : "normal")
                    .style("text-decoration", titleCfg.titleUnderline.value ? "underline" : "none")
                    .style("fill", this.isHighContrast ? this.hcForeground : titleCfg.titleColor.value.value)
                    .text(titleCfg.titleText.value)
                    .style("display", null);
            } else {
                this.titleEl.style("display", "none");
            }

            const gaugeType     = gaugeCfg.gaugeType.value.value as string;
            const thickness     = Math.max(4, gaugeCfg.thickness.value);
            const animDuration  = Math.max(0, gaugeCfg.animationDuration.value);

            const angles = GAUGE_ANGLES[gaugeType] || GAUGE_ANGLES.semicircle;
            const startAngle = angles.start;
            const endAngle   = angles.end;

            const minVal = parsed.min;
            const maxVal = Math.max(parsed.max, minVal + 1); // prevent zero-range
            const currentVal = clamp(parsed.value, minVal, maxVal);

            // Zone boundaries clamped to scale range
            const zone1End = clamp(zonesCfg.zone1End.value, minVal, maxVal);
            const zone2End = clamp(zonesCfg.zone2End.value, zone1End, maxVal);

            // ── Responsive layout ───────────────────────────────────────
            const padding = 12;
            const textSpace = 52; // room for value + label text below the arc centre
            const isSemicircle = gaugeType === "semicircle";

            // For a semicircle the arc occupies half the circle height.
            // For three-quarter / arc gauges the bottom extends further.
            // Reserve buffer when zone callouts sit outside the outer edge so they don't clip
            const labelPosEarly = String(zonesCfg.zoneLabelPosition.value?.value || "band");
            const calloutFontSizeEarly = zonesCfg.zoneLabelFontSize.value > 0
                ? zonesCfg.zoneLabelFontSize.value
                : 12;
            const outerLabelBuffer = (zonesCfg.showZoneLabels.value && labelPosEarly === "outerEdge")
                ? Math.max(18, calloutFontSizeEarly + 8)
                : 0;

            const verticalFactor = isSemicircle ? 2.0 : 1.35;
            const maxRadiusFromHeight = ((height - padding * 2 - textSpace - titleHeight - outerLabelBuffer) * verticalFactor) / 2;
            const maxRadiusFromWidth  = (width - padding * 2 - outerLabelBuffer * 2) / 2;
            const radius = Math.max(24, Math.min(maxRadiusFromWidth, maxRadiusFromHeight));

            const innerRadius = Math.max(0, radius - thickness);
            const outerRadius = radius;

            // Centre the gauge group (offset down by title height when title is shown)
            const cx = width / 2;
            const cy = isSemicircle
                ? padding + titleHeight + radius
                : padding + titleHeight + radius + thickness * 0.5;

            this.gaugeGroup.attr("transform", `translate(${cx},${cy})`);

            // ── Angle scale ─────────────────────────────────────────────
            const angleScale = scaleLinear()
                .domain([minVal, maxVal])
                .range([startAngle, endAngle])
                .clamp(true);

            const arcGen = d3arc();

            // ── Border arc ───────────────────────────────────────────────
            if (gaugeCfg.showBorder.value) {
                const bw = Math.max(1, gaugeCfg.borderWidth.value);
                const bColor = this.isHighContrast ? this.hcForeground : gaugeCfg.borderColor.value.value;
                this.borderPath
                    .attr("d", arcGen({
                        innerRadius: innerRadius,
                        outerRadius: outerRadius,
                        startAngle: startAngle,
                        endAngle: endAngle
                    }))
                    .attr("fill", "none")
                    .attr("stroke", bColor)
                    .attr("stroke-width", bw)
                    .attr("opacity", 1)
                    .style("display", null);
            } else {
                this.borderPath.style("display", "none");
            }

            // ── High contrast overrides for zone colors ──────────────────
            const z1Color = this.isHighContrast ? this.hcForeground : zonesCfg.zone1Color.value.value;
            const z2Color = this.isHighContrast ? this.hcForeground : zonesCfg.zone2Color.value.value;
            const z3Color = this.isHighContrast
                ? this.hcForeground
                : (this.zone3ColorHelper?.getColorForMeasure(dataView.metadata?.objects, "value")
                    ?? zonesCfg.zone3Color.value.value);

            // ── Gradient defs (rebuilt each render to honour colour changes) ──
            this.defs.selectAll("*").remove();
            const useGradient = !!zonesCfg.useGradient.value && !this.isHighContrast;
            if (useGradient) {
                this.buildZoneGradient("zone1-grad", z1Color);
                this.buildZoneGradient("zone2-grad", z2Color);
                this.buildZoneGradient("zone3-grad", z3Color);
            }

            // ── Zone background arcs ────────────────────────────────────
            const z1Fill = useGradient ? "url(#zone1-grad)" : z1Color;
            const z2Fill = useGradient ? "url(#zone2-grad)" : z2Color;
            const z3Fill = useGradient ? "url(#zone3-grad)" : z3Color;
            const baseZoneOpacity = this.isHighContrast ? 0.5 : (useGradient ? 0.85 : 0.3);

            // v2 board look (01-18 Task 4, audit-board polish) — "active
            // zone lights, others dim": the zone the current value falls
            // in renders at a lit-up opacity; the other two dim well below
            // the pre-existing flat 0.3/0.85. High contrast keeps the
            // pre-existing flat 0.5 for all three (opacity-only dimming
            // under HC would still read as colour-adjacent state, so the
            // HC path stays untouched — same convention as every other
            // colour-only affordance in this suite).
            const LIT_OPACITY = this.isHighContrast ? baseZoneOpacity : (useGradient ? 0.95 : 0.55);
            const DIM_OPACITY = this.isHighContrast ? baseZoneOpacity : (useGradient ? 0.35 : 0.12);
            const zone1Opacity = currentVal <= zone1End ? LIT_OPACITY : DIM_OPACITY;
            const zone2Opacity = (currentVal > zone1End && currentVal <= zone2End) ? LIT_OPACITY : DIM_OPACITY;
            const zone3Opacity = currentVal > zone2End ? LIT_OPACITY : DIM_OPACITY;

            this.drawArc(this.zone1Path, arcGen, innerRadius, outerRadius,
                startAngle, angleScale(zone1End),
                z1Fill, zone1Opacity);

            this.drawArc(this.zone2Path, arcGen, innerRadius, outerRadius,
                angleScale(zone1End), angleScale(zone2End),
                z2Fill, zone2Opacity);

            this.drawArc(this.zone3Path, arcGen, innerRadius, outerRadius,
                angleScale(zone2End), endAngle,
                z3Fill, zone3Opacity);

            // ── Value colour (matches whichever zone the needle is in) ──
            let valueColor: string;
            if (currentVal <= zone1End) {
                valueColor = z1Color;
            } else if (currentVal <= zone2End) {
                valueColor = z2Color;
            } else {
                valueColor = z3Color;
            }

            // ── Value indicator (arc, needle, or both) ─────────────────
            const valueStyle = (valueCfg.valueStyle.value?.value as string) || "arc";
            const valueInner = innerRadius + 2;
            const valueOuter = outerRadius - 2;
            const valueEndAngle = angleScale(currentVal);

            const showArc = valueStyle === "arc" || valueStyle === "both";
            const showNeedle = valueStyle === "needle" || valueStyle === "both";

            // Value arc — translucent overlay so zone colours stay primary.
            // Zones show through tinted by the value colour where the value reaches.
            const VALUE_ARC_OPACITY = 0.25;
            if (showArc) {
                if (animDuration > 0) {
                    const prevAngle = this.previousValueAngle ?? startAngle;
                    (this.valuePath as any)
                        .attr("fill", valueColor)
                        .attr("opacity", VALUE_ARC_OPACITY)
                        .style("display", null)
                        .transition()
                        .duration(animDuration)
                        .attrTween("d", () => {
                            const interp = interpolate(prevAngle, valueEndAngle);
                            return (t: number) => {
                                return arcGen({
                                    innerRadius: valueInner,
                                    outerRadius: valueOuter,
                                    startAngle: startAngle,
                                    endAngle: interp(t)
                                }) || "";
                            };
                        });
                } else {
                    this.valuePath
                        .attr("d", arcGen({
                            innerRadius: valueInner,
                            outerRadius: valueOuter,
                            startAngle: startAngle,
                            endAngle: valueEndAngle
                        }))
                        .attr("fill", valueColor)
                        .attr("opacity", VALUE_ARC_OPACITY)
                        .style("display", null);
                }
            } else {
                this.valuePath.style("display", "none");
            }
            this.previousValueAngle = valueEndAngle;

            // Value needle (tachometer style from centre, with eased rotation)
            if (showNeedle) {
                // v2 board look (01-18 Task 4, audit-board polish) — "black
                // needle on light canvas / band-tinted [zone colour] on
                // dark": extends the EXISTING empty-string "auto" sentinel
                // (Needle Color's own pre-existing default/idiom — "leave
                // default to match zone color") with a theme branch, rather
                // than inventing a new property. An explicit Needle Color
                // override still resolves untouched (D-16).
                const customNeedleColor = valueCfg.needleColor.value.value;
                const autoNeedleColor = theme === "light" ? "#000000" : valueColor;
                const nColor = this.isHighContrast ? this.hcForeground
                    : (customNeedleColor && customNeedleColor.length > 0 ? customNeedleColor : autoNeedleColor);
                const needleLen = outerRadius + 4;
                const needleWidth = Math.max(3, thickness * 0.15);
                const hubRadius = Math.max(5, thickness * 0.3);

                const buildNeedlePath = (a: number): string => {
                    const tipX = needleLen * Math.sin(a);
                    const tipY = -needleLen * Math.cos(a);
                    const perp = a + Math.PI / 2;
                    const bx1 = needleWidth * Math.sin(perp);
                    const by1 = -needleWidth * Math.cos(perp);
                    const bx2 = -needleWidth * Math.sin(perp);
                    const by2 = needleWidth * Math.cos(perp);
                    return `M ${bx1} ${by1} L ${tipX} ${tipY} L ${bx2} ${by2} Z`;
                };

                if (animDuration > 0) {
                    const prev = this.previousValueAngle ?? startAngle;
                    (this.targetNeedle as any)
                        .attr("fill", nColor)
                        .style("display", null)
                        .transition()
                        .duration(animDuration)
                        .attrTween("d", () => {
                            const interp = interpolate(prev, valueEndAngle);
                            return (t: number) => buildNeedlePath(interp(t));
                        });
                } else {
                    this.targetNeedle
                        .attr("d", buildNeedlePath(valueEndAngle))
                        .attr("fill", nColor)
                        .style("display", null);
                }

                this.needleHub
                    .attr("cx", 0).attr("cy", 0)
                    .attr("r", hubRadius)
                    .attr("fill", nColor)
                    .style("display", null);
            } else {
                this.targetNeedle.style("display", "none");
                this.needleHub.style("display", "none");
            }

            // ── Target marker ───────────────────────────────────────────
            const showTarget = targetCfg.showTarget.value
                && parsed.target !== null
                && (targetCfg.targetStyle.value.value as string) !== "none";

            if (showTarget) {
                const targetAngle = angleScale(clamp(parsed.target!, minVal, maxVal));
                const tColor = this.isHighContrast ? this.hcForeground : targetCfg.targetColor.value.value;
                const tStyle = targetCfg.targetStyle.value.value as string;

                this.targetLine.style("display", "none");
                this.targetMarker.style("display", "none");

                if (tStyle === "line") {
                    const x1 = (innerRadius - 4) * Math.sin(targetAngle);
                    const y1 = -(innerRadius - 4) * Math.cos(targetAngle);
                    const x2 = (outerRadius + 4) * Math.sin(targetAngle);
                    const y2 = -(outerRadius + 4) * Math.cos(targetAngle);

                    this.targetLine
                        .attr("x1", x1).attr("y1", y1)
                        .attr("x2", x2).attr("y2", y2)
                        .attr("stroke", tColor)
                        .attr("stroke-width", 2.5)
                        .style("display", null);
                } else if (tStyle === "marker") {
                    const mx = (outerRadius + 3) * Math.sin(targetAngle);
                    const my = -(outerRadius + 3) * Math.cos(targetAngle);

                    this.targetMarker
                        .attr("cx", mx).attr("cy", my)
                        .attr("r", 5)
                        .attr("fill", tColor)
                        .style("display", null);
                }
            } else {
                this.targetLine.style("display", "none");
                this.targetMarker.style("display", "none");
            }

            // ── Comparison marker (e.g. previous period) ────────────────
            const showComparison = compCfg.showComparison.value && parsed.comparison !== null;
            if (showComparison) {
                const compAngle = angleScale(clamp(parsed.comparison!, minVal, maxVal));
                const cColor = this.isHighContrast ? this.hcForeground : compCfg.comparisonColor.value.value;
                const cStyle = compCfg.comparisonStyle.value.value as string;

                if (cStyle === "line") {
                    const x1 = (innerRadius - 4) * Math.sin(compAngle);
                    const y1 = -(innerRadius - 4) * Math.cos(compAngle);
                    const x2 = (outerRadius + 4) * Math.sin(compAngle);
                    const y2 = -(outerRadius + 4) * Math.cos(compAngle);

                    this.compLine
                        .attr("x1", x1).attr("y1", y1)
                        .attr("x2", x2).attr("y2", y2)
                        .attr("stroke", cColor)
                        .attr("stroke-width", 2)
                        .attr("stroke-dasharray", "3 2")
                        .attr("opacity", 0.85)
                        .style("display", null);
                    this.compMarker.style("display", "none");
                } else {
                    const mx = (outerRadius + 6) * Math.sin(compAngle);
                    const my = -(outerRadius + 6) * Math.cos(compAngle);

                    this.compMarker
                        .attr("cx", mx).attr("cy", my)
                        .attr("r", 4.5)
                        .attr("fill", "#ffffff")
                        .attr("stroke", cColor)
                        .attr("stroke-width", 2.5)
                        .style("display", null);
                    this.compLine.style("display", "none");
                }
            } else {
                this.compLine.style("display", "none");
                this.compMarker.style("display", "none");
            }

            // ── Zone callout labels ─────────────────────────────────────
            // Three placement modes:
            //   • "band"       — labels sit on the arc band itself, contrast text colour. Hidden if band < 14px.
            //   • "outerEdge"  — labels sit just outside the outer edge in zone colour. Layout reserves buffer above.
            //   • "innerEdge"  — labels sit just inside the inner edge (donut hole) in zone colour.
            // All modes rotate text along the arc tangent so labels follow the curve.
            if (zonesCfg.showZoneLabels.value) {
                const bandWidth = outerRadius - innerRadius;
                const labelPos = String(zonesCfg.zoneLabelPosition.value?.value || "band");
                const minBandForLabel = 14;
                const calloutFontSize = zonesCfg.zoneLabelFontSize.value > 0
                    ? zonesCfg.zoneLabelFontSize.value
                    : (labelPos === "band"
                        ? Math.max(8, Math.min(bandWidth * 0.45, 12))
                        : Math.max(9, Math.min(radius * 0.085, 13)));

                let labelR: number;
                if (labelPos === "band") {
                    labelR = (innerRadius + outerRadius) / 2;
                } else if (labelPos === "outerEdge") {
                    labelR = outerRadius + Math.max(10, calloutFontSize * 0.85);
                } else {
                    // innerEdge — sit just inside the inner radius (in the donut hole)
                    labelR = Math.max(20, innerRadius - Math.max(8, calloutFontSize * 0.75));
                }

                const placeCallout = (sel: Selection<SVGTextElement, unknown, null, undefined>,
                                      text: string, sa: number, ea: number, zoneColor: string) => {
                    if (!text) { sel.style("display", "none"); return; }
                    if (labelPos === "band" && bandWidth < minBandForLabel) {
                        sel.style("display", "none");
                        return;
                    }
                    if (labelPos === "innerEdge" && innerRadius < 28) {
                        // Donut hole too small — would overlap value text
                        sel.style("display", "none");
                        return;
                    }
                    const mid = (sa + ea) / 2;
                    const x = labelR * Math.sin(mid);
                    const y = -labelR * Math.cos(mid);

                    // Rotate text to follow the arc tangent.
                    let rotDeg = (mid * 180) / Math.PI;
                    if (Math.cos(mid) < 0) rotDeg += 180;

                    // band: contrast against fill. outerEdge / innerEdge: zone colour on transparent.
                    const textColor = labelPos === "band"
                        ? this.contrastTextColor(zoneColor)
                        : zoneColor;

                    sel
                        .attr("x", 0).attr("y", 0)
                        .attr("transform", `translate(${x},${y}) rotate(${rotDeg})`)
                        .attr("text-anchor", "middle")
                        .attr("dominant-baseline", "middle")
                        .style("font-size", calloutFontSize + "px")
                        .style("font-weight", labelPos === "band" ? "700" : "600")
                        .style("letter-spacing", "0.5px")
                        .style("text-transform", "uppercase")
                        .style("fill", this.isHighContrast ? this.hcForeground : textColor)
                        .style("opacity", labelPos === "band" ? 1 : 0.95)
                        .style("pointer-events", "none")
                        .text(text)
                        .style("display", null);
                };
                placeCallout(this.zone1Label, zonesCfg.zone1Label.value || "",
                    startAngle, angleScale(zone1End), z1Color);
                placeCallout(this.zone2Label, zonesCfg.zone2Label.value || "",
                    angleScale(zone1End), angleScale(zone2End), z2Color);
                placeCallout(this.zone3Label, zonesCfg.zone3Label.value || "",
                    angleScale(zone2End), endAngle, z3Color);
            } else {
                this.zone1Label.style("display", "none");
                this.zone2Label.style("display", "none");
                this.zone3Label.style("display", "none");
            }

            // ── Value text ──────────────────────────────────────────────
            // "Value always on top" (01-18 Task 4, audit-board polish) is
            // already true by construction: this.valueText is appended in
            // the constructor AFTER the needle/hub/target/comparison/zone-
            // label elements (SVG paints later-appended siblings on top),
            // so no DOM-reorder was needed here — verified via the
            // constructor's append order, not re-derived per render.
            const autoValueFontSize = Math.max(12, Math.min(radius * 0.35, 48));
            const valueFontSize = valueCfg.valueFontSize.value > 0
                ? valueCfg.valueFontSize.value
                : autoValueFontSize;
            const textYBase = isSemicircle ? 8 : radius * 0.15 + 8;

            // ColorHelper.getColorForMeasure (TEXT-02 fx) already resolves
            // "a bound rule's colour, else the static Value Color swatch"
            // (the swatch was passed in as its default-colour constructor
            // arg above). What it can't know is this visual's own "leave
            // empty to match zone colour" idiom — so an empty result still
            // falls through to the data-driven zone colour, exactly as
            // before this plan (D-06).
            const resolvedValueColor = this.valueColorHelper?.getColorForMeasure(dataView?.metadata?.objects, "value") ?? "";
            const effectiveValueColor = this.isHighContrast ? this.hcForeground
                : (resolvedValueColor && resolvedValueColor.length > 0 ? resolvedValueColor : valueColor);

            // Text treatment (TEXT-01) — `?? default` reproduces the
            // pre-existing hardcoded font-weight:700 exactly when an old
            // saved report has none of these new properties set (D-06):
            // valueBold defaults true.
            const valueFontFamily = valueCfg.valueFontFamily.value || "Segoe UI, sans-serif";
            const valueWeight = valueCfg.valueBold.value ? "700" : "400";
            const valueTextStyle = valueCfg.valueItalic.value ? "italic" : "normal";
            const valueDecoration = valueCfg.valueUnderline.value ? "underline" : "none";

            if (valueCfg.showValue.value) {
                const format = valueCfg.valueFormat.value.value as string;
                const decimals = valueCfg.decimalPlaces.value;
                const fmt = (n: number) => format === "percent"
                    ? n.toFixed(decimals) + "%"
                    : n.toFixed(decimals);

                this.valueText
                    .attr("x", 0)
                    .attr("y", textYBase)
                    .attr("text-anchor", "middle")
                    .attr("dominant-baseline", "hanging")
                    .style("font-size", valueFontSize + "px")
                    .style("font-family", valueFontFamily)
                    .style("font-weight", valueWeight)
                    .style("font-style", valueTextStyle)
                    .style("text-decoration", valueDecoration)
                    .style("fill", effectiveValueColor)
                    .style("display", null);

                // Counter animation: tween from previous value to current
                if (animDuration > 0) {
                    const prev = this.previousValue ?? currentVal;
                    (this.valueText as any)
                        .transition()
                        .duration(animDuration)
                        .tween("text", () => {
                            const interp = interpolate(prev, currentVal);
                            return (t: number) => {
                                this.valueText.text(fmt(interp(t)));
                            };
                        });
                } else {
                    this.valueText.text(fmt(currentVal));
                }
            } else {
                this.valueText.style("display", "none");
            }
            this.previousValue = currentVal;

            // ── Zone label ──────────────────────────────────────────────
            if (valueCfg.showLabel.value) {
                let zoneLabel: string;
                if (currentVal <= zone1End) {
                    zoneLabel = this.localizationManager.getDisplayName("Visual_Zone_Poor");
                } else if (currentVal <= zone2End) {
                    zoneLabel = this.localizationManager.getDisplayName("Visual_Zone_Acceptable");
                } else {
                    zoneLabel = this.localizationManager.getDisplayName("Visual_Zone_Good");
                }

                const autoLabelFontSize = Math.max(10, Math.min(radius * 0.16, 20));
                const labelFontSize = valueCfg.labelFontSize.value > 0
                    ? valueCfg.labelFontSize.value
                    : autoLabelFontSize;
                const labelY = textYBase + valueFontSize + 4;

                const customLabelColor = valueCfg.labelColor.value.value;
                const effectiveLabelColor = this.isHighContrast ? this.hcForeground
                    : (customLabelColor && customLabelColor.length > 0 ? customLabelColor : valueColor);

                // Text treatment (TEXT-01) — `?? default` reproduces the
                // pre-existing hardcoded font-weight:500 as closely as a
                // boolean toggle allows (labelBold defaults false -> 400,
                // the closest match; D-06).
                const labelFontFamily = valueCfg.labelFontFamily.value || "Segoe UI, sans-serif";
                const labelWeight = valueCfg.labelBold.value ? "700" : "400";
                const labelStyle = valueCfg.labelItalic.value ? "italic" : "normal";
                const labelDecoration = valueCfg.labelUnderline.value ? "underline" : "none";

                this.labelText
                    .attr("x", 0)
                    .attr("y", labelY)
                    .attr("text-anchor", "middle")
                    .attr("dominant-baseline", "hanging")
                    .style("font-size", labelFontSize + "px")
                    .style("font-family", labelFontFamily)
                    .style("font-weight", labelWeight)
                    .style("font-style", labelStyle)
                    .style("text-decoration", labelDecoration)
                    .style("fill", effectiveLabelColor)
                    .text(zoneLabel)
                    .style("display", null);
            } else {
                this.labelText.style("display", "none");
            }

            // Build tooltip data for current state
            const format = valueCfg.valueFormat.value.value as string;
            const decimals = valueCfg.decimalPlaces.value;
            const tooltipVal = format === "percent"
                ? currentVal.toFixed(decimals) + "%"
                : currentVal.toFixed(decimals);

            let zoneName: string;
            if (currentVal <= zone1End) {
                zoneName = "Poor";
            } else if (currentVal <= zone2End) {
                zoneName = "Acceptable";
            } else {
                zoneName = "Good";
            }

            this.currentTooltipItems = [];
            if (parsed.categoryLabel) {
                this.currentTooltipItems.push({ displayName: "Category", value: parsed.categoryLabel });
            }
            this.currentTooltipItems.push(
                { displayName: "Value", value: tooltipVal },
                { displayName: "Zone", value: zoneName }
            );
            if (parsed.target !== null) {
                const targetStr = format === "percent"
                    ? parsed.target.toFixed(decimals) + "%"
                    : parsed.target.toFixed(decimals);
                this.currentTooltipItems.push({ displayName: "Target", value: targetStr });
            }
            if (parsed.comparison !== null) {
                const compStr = format === "percent"
                    ? parsed.comparison.toFixed(decimals) + "%"
                    : parsed.comparison.toFixed(decimals);
                const compLabel = compCfg.comparisonLabel.value || "Comparison";
                this.currentTooltipItems.push({ displayName: compLabel, value: compStr });
            }

            this.eventService.renderingFinished(options);
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
