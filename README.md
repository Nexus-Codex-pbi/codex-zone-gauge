# Codex Zone Gauge

A single-reading gauge with six instruments: Pressure Dial, Speedometer,
Tachometer, Progress Ring, Segmented Meter and Thermometer.

## Data

Bind one numeric **Value** measure. Optional wells are **Target**, **Comparison**,
**Minimum**, **Maximum**, and one **Category** for selection and tooltip context.
The first delivered category row is used; the visual does not aggregate rows itself.
Missing, blank, nonnumeric and non-finite readings are not asserted as zero.

Bound scale endpoints are used as delivered. Unbound endpoints are derived from
Value, Target and Comparison, rounded outward to a countable step. All-nonnegative
data starts at zero. Minimum must be below Maximum; invalid bounds show validation.
Numeric readouts and tooltips preserve the actual reading outside the scale.
Needles and fills clamp to the drawable range; tooltips disclose overflow.

## Instruments And Zones

Threshold banding uses Zone 1 End and Zone 2 End, with selectable higher-is-better
or lower-is-better direction. Target-relative banding requires Target and uses
symmetric on-target and warning tolerances. Boundaries belong to the better band.
At a zero target, percentage tolerances are zero: only exact target is on target.

All instruments use the configured zone colours. Dials draw zone bands, the meter
colours its LEDs by position, and the thermometer/ring use the current state.
An explicit Ring Colour overrides the value arc. Needle and readout overrides
remain independent. Match Needle Colour links the readout to the needle/state.

Progress Ring shows Value / Target as a percentage, or Value / Maximum when
Target is missing or zero. It is not progress through Minimum-Maximum. Show Target
only controls marker visibility, not this arithmetic. Decimal Places controls
the derived percentage. Value Arc Hidden retains a visible full-width ring for
compatibility; Thin Band explicitly selects the narrow ring.

Target and Comparison are tick markers in every style. Their visibility does not
change scale derivation. Comparison is dashed on the dials and ring.

## Formatting

- Gauge Style selects the instrument, with Segments for the meter and Dial Face
  for Speedometer/Tachometer.
- Title supplies text, alignment, font and colour.
- Zones supplies banding, direction, tolerance, thresholds and colours.
- Target and Comparison supply marker visibility and colour.
- Value Display supplies value/label visibility, font controls, colour overrides
  and Decimal Places. Untouched precision uses the measure format; explicitly
  saved Decimal Places overrides it, including a value equal to the default.
- Value Format Percent on a plain number denotes already-scaled percent points.
  A percent model format denotes a fraction and is scaled by 100. Progress Ring
  always shows derived completion and hides this inapplicable selector.
- Background supplies fill and transparency; Border and Corner Accents supply
  the surrounding chrome.

Tooltips use each measure's own model format. The shared formatter supports common
numeric, percent and currency patterns; accounting negative-section parentheses
remain a known shared-formatting limitation.

Retired Gauge Type, Thickness, Animation, Value Style, marker-style and zone-callout
controls are not part of the current pane. Their capability entries remain for
saved-report compatibility; retired instrument values fall back to Pressure Dial.

## Interaction And Accessibility

Category-bound gauges support click-to-select and keyboard activation. Host
interaction permissions apply. Context menus and tooltips carry the current
category identity. High contrast uses host foreground/background colours and
exposes zone state in text. Automatic ink adapts to the composited palette
background; an image or shape behind the visual may require explicit colours.

## Support

https://nexuscodex.nexus/support
