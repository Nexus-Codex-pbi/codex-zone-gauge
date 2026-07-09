"use strict";

import powerbi from "powerbi-visuals-api";

import { formattingSettings } from "powerbi-visuals-utils-formattingmodel";

import FormattingSettingsCard = formattingSettings.SimpleCard;
import FormattingSettingsSlice = formattingSettings.Slice;
import FormattingSettingsModel = formattingSettings.Model;

import { BackgroundSettings } from "../../_shared/formatting/backgroundSettings";

const ConstantOrRule = powerbi.VisualEnumerationInstanceKinds.ConstantOrRule;

function alignSlice(name: string, defaultValue: string = "left") {
    return new formattingSettings.AlignmentGroup({
        name, displayName: "Alignment",
        mode: powerbi.visuals.AlignmentGroupMode.Horizonal,
        value: defaultValue,
    });
}

export function textAlignFor(v: string | undefined): string {
    return v === "center" || v === "right" ? v : "left";
}

class TitleSettingsCard extends FormattingSettingsCard {
    showTitle = new formattingSettings.ToggleSwitch({ name: "showTitle", displayName: "Show Title", value: false });
    titleText = new formattingSettings.TextInput({ name: "titleText", displayName: "Title Text", placeholder: "Visual title", value: "" });

    titleFontFamily = new formattingSettings.FontPicker({ name: "titleFontFamily", displayName: "Font Family", value: "Segoe UI, sans-serif" });
    titleFontSize = new formattingSettings.NumUpDown({ name: "titleFontSize", displayName: "Font Size", value: 14 });
    titleBold = new formattingSettings.ToggleSwitch({ name: "titleBold", displayName: "Bold", value: true });
    titleItalic = new formattingSettings.ToggleSwitch({ name: "titleItalic", displayName: "Italic", value: false });
    titleUnderline = new formattingSettings.ToggleSwitch({ name: "titleUnderline", displayName: "Underline", value: false });

    titleFont = new formattingSettings.FontControl({
        name: "titleFont", displayName: "Font",
        fontFamily: this.titleFontFamily, fontSize: this.titleFontSize,
        bold: this.titleBold, italic: this.titleItalic, underline: this.titleUnderline,
    });

    titleAlign = alignSlice("titleAlign", "left");

    titleColor = new formattingSettings.ColorPicker({
        name: "titleColor", displayName: "Font Color",
        value: { value: "#1a1a2e" }, instanceKind: ConstantOrRule,
    });

    name: string = "titleSettings";
    displayName: string = "Visual Title";
    slices: Array<FormattingSettingsSlice> = [
        this.showTitle, this.titleText, this.titleFont, this.titleAlign, this.titleColor
    ];
}

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

    targetColor = new formattingSettings.ColorPicker({
        name: "targetColor",
        displayName: "Target Color",
        value: { value: "#130064" },
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

    valueFontSize = new formattingSettings.NumUpDown({
        name: "valueFontSize",
        displayName: "Value Font Size",
        description: "Font size for value text (0 = auto-scale)",
        value: 0
    });

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

    labelFontSize = new formattingSettings.NumUpDown({
        name: "labelFontSize",
        displayName: "Label Font Size",
        description: "Font size for zone label text (0 = auto-scale)",
        value: 0
    });

    name: string = "valueDisplay";
    displayName: string = "Value Display";
    slices: Array<FormattingSettingsSlice> = [
        this.valueStyle,
        this.needleColor,
        this.showValue,
        this.valueFormat,
        this.decimalPlaces,
        this.valueColor,
        this.valueFontSize,
        this.showLabel,
        this.labelColor,
        this.labelFontSize
    ];
}

export class VisualFormattingSettingsModel extends FormattingSettingsModel {
    titleSettingsCard = new TitleSettingsCard();
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

    cards = [this.titleSettingsCard, this.gaugeSettingsCard, this.zonesCard, this.targetSettingsCard, this.comparisonSettingsCard, this.valueDisplayCard, this.background];
}
