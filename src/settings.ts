"use strict";

import powerbi from "powerbi-visuals-api";

import { formattingSettings } from "powerbi-visuals-utils-formattingmodel";

import FormattingSettingsCard = formattingSettings.SimpleCard;
import FormattingSettingsSlice = formattingSettings.Slice;
import FormattingSettingsModel = formattingSettings.Model;

import { BackgroundSettings } from "./shared/backgroundSettings";
import { TitleSettings } from "./shared/titleSettings";
import { BorderSettings } from "./shared/borderSettings";
import { CardSignatureSettings } from "./shared/cardSignatureSettings";
import { alignSelfFor, textAlignFor, makeFontControl } from "./shared/textFormatting";
import { targetToken } from "./shared/bandEngine";

const ConstantOrRule = powerbi.VisualEnumerationInstanceKinds.ConstantOrRule;

// TitleSettings + alignment helpers now live in _shared/formatting/ (D-13,
// D-14 — migrated onto the frozen v2 standard from Plan 10; the inline
// TitleSettingsCard/alignSlice duplicates that used to live here are
// deleted). Re-exported so visual.ts can import them from "./settings"
// (stable import path, zero churn on the consuming side).
export { TitleSettings, alignSelfFor, textAlignFor };

class GaugeSettingsCard extends FormattingSettingsCard {
    gaugeType = new formattingSettings.ItemDropdown({
        name: "gaugeType",
        displayName: "Gauge Type",
        description: "Shape of the gauge arc",
        items: [
            { displayName: "Semi-circle", value: "semicircle" },
            { displayName: "Three-quarter", value: "threeQuarter" },
            { displayName: "Arc", value: "arc" }
        ],
        value: { displayName: "Semi-circle", value: "semicircle" }
    });

    thickness = new formattingSettings.NumUpDown({
        name: "thickness",
        displayName: "Arc Thickness",
        description: "Thickness of the gauge arc in pixels",
        value: 20
    });

    animationDuration = new formattingSettings.NumUpDown({
        name: "animationDuration",
        displayName: "Animation Duration",
        description: "Duration of arc fill animation in milliseconds",
        value: 800
    });

    showBorder = new formattingSettings.ToggleSwitch({
        name: "showBorder",
        displayName: "Show Border",
        description: "Draw a border outline around the gauge arc",
        value: false
    });

    borderColor = new formattingSettings.ColorPicker({
        name: "borderColor",
        displayName: "Border Color",
        value: { value: "#333333" },
        instanceKind: ConstantOrRule
    });

    borderWidth = new formattingSettings.NumUpDown({
        name: "borderWidth",
        displayName: "Border Width",
        description: "Width of the border outline in pixels",
        value: 2
    });

    name: string = "gaugeSettings";
    displayName: string = "Gauge";
    slices: Array<FormattingSettingsSlice> = [
        this.gaugeType,
        this.thickness,
        this.animationDuration,
        this.showBorder,
        this.borderColor,
        this.borderWidth
    ];
}

class ZonesCard extends FormattingSettingsCard {
    zone1End = new formattingSettings.NumUpDown({
        name: "zone1End",
        displayName: "Zone 1 End",
        description: "Upper boundary of zone 1 (danger)",
        value: 80
    });

    zone1Color = new formattingSettings.ColorPicker({
        name: "zone1Color",
        displayName: "Zone 1 Color (Danger)",
        value: { value: "#e60e22" },
        instanceKind: ConstantOrRule
    });

    zone2End = new formattingSettings.NumUpDown({
        name: "zone2End",
        displayName: "Zone 2 End",
        description: "Upper boundary of zone 2 (warning)",
        value: 90
    });

    zone2Color = new formattingSettings.ColorPicker({
        name: "zone2Color",
        displayName: "Zone 2 Color (Warning)",
        value: { value: "#d4920a" },
        instanceKind: ConstantOrRule
    });

    zone3Color = new formattingSettings.ColorPicker({
        name: "zone3Color",
        displayName: "Zone 3 Color (Success)",
        value: { value: "#007064" },
        instanceKind: ConstantOrRule
    });

    useGradient = new formattingSettings.ToggleSwitch({
        name: "useGradient",
        displayName: "Gradient Zone Fills",
        description: "Render zones with a subtle gradient (off = flat colour)",
        value: true
    });

    showZoneLabels = new formattingSettings.ToggleSwitch({
        name: "showZoneLabels",
        displayName: "Show Zone Callouts",
        description: "Display the three zone names around the arc",
        value: false
    });

    zoneLabelPosition = new formattingSettings.ItemDropdown({
        name: "zoneLabelPosition",
        displayName: "Callout Position",
        items: [
            { displayName: "On the arc band", value: "band" },
            { displayName: "Outside the outer edge", value: "outerEdge" },
            { displayName: "Inside the inner edge", value: "innerEdge" }
        ],
        value: { displayName: "On the arc band", value: "band" }
    });

    zone1Label = new formattingSettings.TextInput({
        name: "zone1Label", displayName: "Zone 1 Callout",
        placeholder: "Critical", value: "Critical"
    });

    zone2Label = new formattingSettings.TextInput({
        name: "zone2Label", displayName: "Zone 2 Callout",
        placeholder: "Warning", value: "Warning"
    });

    zone3Label = new formattingSettings.TextInput({
        name: "zone3Label", displayName: "Zone 3 Callout",
        placeholder: "Healthy", value: "Healthy"
    });

    zoneLabelFontSize = new formattingSettings.NumUpDown({
        name: "zoneLabelFontSize",
        displayName: "Callout Font Size",
        description: "Font size for zone callout labels (0 = auto)",
        value: 0
    });

    name: string = "zones";
    displayName: string = "Zones";
    slices: Array<FormattingSettingsSlice> = [
        this.zone1End,
        this.zone1Color,
        this.zone2End,
        this.zone2Color,
        this.zone3Color,
        this.useGradient,
        this.showZoneLabels,
        this.zoneLabelPosition,
        this.zone1Label,
        this.zone2Label,
        this.zone3Label,
        this.zoneLabelFontSize
    ];
}

class ComparisonSettingsCard extends FormattingSettingsCard {
    showComparison = new formattingSettings.ToggleSwitch({
        name: "showComparison",
        displayName: "Show Comparison Marker",
        description: "Display the Comparison measure as a secondary marker on the arc",
        value: true
    });

    comparisonStyle = new formattingSettings.ItemDropdown({
        name: "comparisonStyle",
        displayName: "Comparison Style",
        items: [
            { displayName: "Line", value: "line" },
            { displayName: "Marker", value: "marker" }
        ],
        value: { displayName: "Marker", value: "marker" }
    });

    comparisonColor = new formattingSettings.ColorPicker({
        name: "comparisonColor",
        displayName: "Comparison Color",
        value: { value: "#5e5d5a" },
        instanceKind: ConstantOrRule
    });

    comparisonLabel = new formattingSettings.TextInput({
        name: "comparisonLabel",
        displayName: "Comparison Label",
        placeholder: "Previous",
        value: "Previous"
    });

    name: string = "comparisonSettings";
    displayName: string = "Comparison";
    slices: Array<FormattingSettingsSlice> = [
        this.showComparison,
        this.comparisonStyle,
        this.comparisonColor,
        this.comparisonLabel
    ];
}

class TargetSettingsCard extends FormattingSettingsCard {
    showTarget = new formattingSettings.ToggleSwitch({
        name: "showTarget",
        displayName: "Show Target",
        value: true
    });

    targetStyle = new formattingSettings.ItemDropdown({
        name: "targetStyle",
        displayName: "Target Style",
        items: [
            { displayName: "Line", value: "line" },
            { displayName: "Marker", value: "marker" },
            { displayName: "None", value: "none" }
        ],
        value: { displayName: "Line", value: "line" }
    });

    // v2 board look (01-18 Task 4, audit-board polish) — the declared
    // default flips from the old navy #130064 to the shared v3 violet
    // target token (targetToken(), bandEngine's dedicated "goal marker"
    // colour, never a band/status colour). An old saved report with an
    // explicit Target Color already resolves that saved value straight
    // through Power BI's own settings framework (D-06/D-16) — only the
    // never-before-touched default changes.
    targetColor = new formattingSettings.ColorPicker({
        name: "targetColor",
        displayName: "Target Color",
        value: { value: targetToken("light") },
        instanceKind: ConstantOrRule
    });

    name: string = "targetSettings";
    displayName: string = "Target";
    slices: Array<FormattingSettingsSlice> = [
        this.showTarget,
        this.targetStyle,
        this.targetColor
    ];
}

class ValueDisplayCard extends FormattingSettingsCard {
    valueStyle = new formattingSettings.ItemDropdown({
        name: "valueStyle",
        displayName: "Value Style",
        description: "How to indicate the current value on the gauge",
        items: [
            { displayName: "Arc", value: "arc" },
            { displayName: "Needle", value: "needle" },
            { displayName: "Both", value: "both" }
        ],
        value: { displayName: "Arc", value: "arc" }
    });

    needleColor = new formattingSettings.ColorPicker({
        name: "needleColor",
        displayName: "Needle Color",
        description: "Color of the value needle (leave default to match zone color)",
        value: { value: "" },
        instanceKind: ConstantOrRule
    });

    showValue = new formattingSettings.ToggleSwitch({
        name: "showValue",
        displayName: "Show Value",
        value: true
    });

    valueFormat = new formattingSettings.ItemDropdown({
        name: "valueFormat",
        displayName: "Value Format",
        items: [
            { displayName: "Number", value: "number" },
            { displayName: "Percent", value: "percent" }
        ],
        value: { displayName: "Number", value: "number" }
    });

    decimalPlaces = new formattingSettings.NumUpDown({
        name: "decimalPlaces",
        displayName: "Decimal Places",
        value: 1
    });

    valueColor = new formattingSettings.ColorPicker({
        name: "valueColor",
        displayName: "Value Color",
        description: "Color of the value text (leave default to match zone color)",
        value: { value: "" },
        instanceKind: ConstantOrRule
    });

    // Value readout text — FontControl composite reuses the existing
    // "valueFontSize" property name (D-06/D-07: additive-only, no schema
    // rename). Bold defaults true to match the previously-hardcoded
    // font-weight:700 (render-nothing-default parity).
    private valueFontBundle = makeFontControl("value", { fontSize: 0, bold: true });
    valueFontFamily = this.valueFontBundle.fontFamily;
    valueFontSize = this.valueFontBundle.fontSize;
    valueBold = this.valueFontBundle.bold;
    valueItalic = this.valueFontBundle.italic;
    valueUnderline = this.valueFontBundle.underline;
    valueFont = this.valueFontBundle.control;

    showLabel = new formattingSettings.ToggleSwitch({
        name: "showLabel",
        displayName: "Show Zone Label",
        description: "Show zone label (e.g. Poor, Acceptable, Good) below value",
        value: true
    });

    labelColor = new formattingSettings.ColorPicker({
        name: "labelColor",
        displayName: "Label Color",
        description: "Color of the zone label text (leave default to match zone color)",
        value: { value: "" },
        instanceKind: ConstantOrRule
    });

    // Zone label text (below value) — FontControl composite reuses the
    // existing "labelFontSize" property name. Bold defaults false — the
    // closest boolean match to the previously-hardcoded font-weight:500
    // (render-nothing-default parity; same design call made on the other
    // batch visuals' "detail"-weight text).
    private labelFontBundle = makeFontControl("label", { fontSize: 0, bold: false });
    labelFontFamily = this.labelFontBundle.fontFamily;
    labelFontSize = this.labelFontBundle.fontSize;
    labelBold = this.labelFontBundle.bold;
    labelItalic = this.labelFontBundle.italic;
    labelUnderline = this.labelFontBundle.underline;
    labelFont = this.labelFontBundle.control;

    name: string = "valueDisplay";
    displayName: string = "Value Display";
    slices: Array<FormattingSettingsSlice> = [
        this.valueStyle,
        this.needleColor,
        this.showValue,
        this.valueFormat,
        this.decimalPlaces,
        this.valueColor,
        this.valueFont,
        this.showLabel,
        this.labelColor,
        this.labelFont
    ];
}

// ─── Gauge Style (GAUGE-02, 7-style rebuild per GAUGE-01-CONCEPT-PICK) ────
// Decisions 2026-07-17: remix is THE look (hard cutover — old reports get it
// too); segmented zones are the remix default treatment.
export class GaugeStyleSettings extends FormattingSettingsCard {
    name = "gaugeStyle";
    displayName = "Gauge Style";

    style = new formattingSettings.ItemDropdown({
        name: "style",
        displayName: "Style",
        items: [
            { displayName: "Zone Gauge (Remix)", value: "remix" },
            { displayName: "Pressure Dial", value: "pressureDial" },
            { displayName: "Speedometer", value: "speedometer" },
            { displayName: "Tachometer", value: "tachometer" },
            { displayName: "Progress Ring", value: "progressRing" },
            { displayName: "Segmented Meter", value: "segmentedMeter" },
            { displayName: "Thermometer", value: "thermometer" },
        ],
        value: { displayName: "Zone Gauge (Remix)", value: "remix" },
    });
    zoneTreatment = new formattingSettings.ItemDropdown({
        name: "zoneTreatment",
        displayName: "Zone treatment",
        items: [
            { displayName: "Segmented", value: "segmented" },
            { displayName: "Solid", value: "solid" },
        ],
        value: { displayName: "Segmented", value: "segmented" },
    });

    slices: FormattingSettingsSlice[] = [this.style, this.zoneTreatment];
}

// ─── Value Arc (GAUGE-03, absorbs kanban #29) ─────────────────────────────
// Hidden from the pane while a non-arc style is active (Decision 2026-07-17)
// — visibility is flipped in visual.ts after the style is known.
export class ValueArcSettings extends FormattingSettingsCard {
    name = "valueArc";
    displayName = "Value Arc";

    arcStyle = new formattingSettings.ItemDropdown({
        name: "arcStyle",
        displayName: "Style",
        items: [
            { displayName: "Tinted overlay", value: "overlay" },
            { displayName: "Thin band", value: "band" },
            { displayName: "Hidden", value: "hidden" },
        ],
        value: { displayName: "Tinted overlay", value: "overlay" },
    });
    opacity = new formattingSettings.Slider({
        name: "opacity",
        displayName: "Opacity",
        value: 100,
        options: {
            minValue: { type: powerbi.visuals.ValidatorType.Min, value: 0 },
            maxValue: { type: powerbi.visuals.ValidatorType.Max, value: 100 }
        }
    });

    slices: FormattingSettingsSlice[] = [this.arcStyle, this.opacity];
}

export class VisualFormattingSettingsModel extends FormattingSettingsModel {
    titleSettingsCard = new TitleSettings();
    gaugeSettingsCard = new GaugeSettingsCard();
    zonesCard = new ZonesCard();
    targetSettingsCard = new TargetSettingsCard();
    comparisonSettingsCard = new ComparisonSettingsCard();
    valueDisplayCard = new ValueDisplayCard();
    background = new BackgroundSettings();

    constructor() {
        super();
        // D-06 default-preservation override (per-visual instance only —
        // _shared/formatting/backgroundSettings.ts itself is untouched,
        // D-11): this visual's SVG never had an explicit background
        // painted before this plan (no CSS rule, no rect) — it was fully
        // transparent. The frozen shared card's own default (opaque
        // white, transparency 0) would regress every old saved report on
        // a non-default report canvas colour/image. Overriding the
        // TRANSPARENCY default to 100 on this instance makes toRgba(...)
        // resolve to alpha 0 regardless of colour, pixel-identical to
        // "no background painted" (D-06).
        this.background.transparency.value = 100;
    }

    visualBorder = new BorderSettings();
    cardSignature = new CardSignatureSettings();
    gaugeStyleCard = new GaugeStyleSettings();
    valueArcCard = new ValueArcSettings();

    cards = [this.gaugeStyleCard, this.titleSettingsCard, this.gaugeSettingsCard, this.zonesCard, this.targetSettingsCard, this.comparisonSettingsCard, this.valueDisplayCard, this.valueArcCard, this.background, this.cardSignature, this.visualBorder];
}
