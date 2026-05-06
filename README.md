# Codex Zone Gauge

## Overview
A gauge visualization that displays a value within a range, divided into colored zones (e.g., danger, warning, success). Supports optional target and comparison markers, and multiple gauge types (semi-circle, three-quarter, arc).

## Features
- Displays a value on an arc with configurable zones (typically three: danger, warning, success)
- Zones can be solid colors or gradients
- Optional zone callout labels (text inside, outside, or on the arc)
- Optional target marker (line or marker) with label
- Optional comparison marker (line or marker) for secondary value (e.g., previous period)
- Value display options: arc (value shown on the arc), needle (tachometer-style), or both
- Configurable gauge thickness, animation duration, border, and border color
- Value formatting: number or percent, with decimal places
- Label for the gauge (optional)
- Tooltips showing value, target, comparison, and zone information on hover
- Click to cross-filter other visuals by category (if bound)
- Right-click context menu for cross-filtering and other interactions
- High contrast mode support
- Supports keyboard focus and screen readers

## Data Roles
| Role | Display Name | Kind | Required? | Data Type | Description |
|------|--------------|------|-----------|-----------|-------------|
| category | Category | Grouping | No (max 1) | Text or Grouping | Optional grouping column. When bound, clicking the gauge filters other visuals by this category. |
| value | Value | Measure | Yes (max 1) | Numeric | The primary value to display on the gauge |
| target | Target | Measure | No (max 1) | Numeric | Target value shown as a marker on the arc |
| comparison | Comparison | Measure | No (max 1) | Numeric | Optional secondary value (e.g. previous period) shown as a marker on the arc |
| minimum | Minimum | Measure | No (max 1) | Numeric | Minimum value of the gauge range |
| maximum | Maximum | Measure | No (max 1) | Numeric | Maximum value of the gauge range |

Note: The Value role is required. Minimum and Maximum roles, if not bound, are auto-calculated from the value and target/comparison values.

## Formatting Options
The visual provides the following format pane cards:

### Title Settings
- Show Title: Toggle visibility of the visual title
- Title Text: Custom title text
- Font Family, Font Size, Bold, Italic, Underline
- Alignment (left, center, right)
- Font Color

### Gauge Settings
- Gauge Type: Semi-circle, Three-quarter, or Arc (defines the arc angle)
- Thickness: Thickness of the gauge arc in pixels
- Animation Duration: Length of the animation in milliseconds (0 to disable)
- Show Border: Toggle visibility of the outer border
- Border Color: Color of the outer border
- Border Width: Width of the outer border in pixels

### Zones
- Zone 1 End: Value at which zone 1 (danger) ends and zone 2 (warning) begins
- Zone 2 End: Value at which zone 2 (warning) ends and zone 3 (success) begins
- Zone 1 Color (Danger): Fill color for zone 1
- Zone 2 Color (Warning): Fill color for zone 2
- Zone 3 Color (Success): Fill color for zone 3
- Use Gradient Zone Fills: Toggle gradient fill for zones (if disabled, solid colors are used)
- Show Zone Callouts: Toggle visibility of zone labels
- Callout Position: On the arc band, Outside the outer edge, or Inside the inner edge
- Zone 1 Callout: Text label for zone 1
- Zone 2 Callout: Text label for zone 2
- Zone 3 Callout: Text label for zone 3
- Callout Font Size: Font size for zone callout labels in pixels

### Comparison
- Show Comparison Marker: Toggle visibility of the comparison marker
- Comparison Style: Line or Marker (visual style of the comparison indicator)
- Comparison Color: Color of the comparison marker
- Comparison Label: Text label for the comparison marker

### Target Settings
- Show Target: Toggle visibility of the target marker
- Target Style: Line, Marker, or None (visual style of the target indicator)
- Target Color: Color of the target marker

### Value Display
- Value Style: Arc, Needle, or Both (how to represent the value)
- Needle Color: Color of the needle (when Value Style is Needle or Both)
- Show Value: Toggle visibility of the value text
- Value Format: Number or Percent (for the value text)
- Decimal Places: Number of decimal places to display (0-6)
- Value Color: Text color of the value text
- Value Font Size: Font size of the value text in pixels
- Show Label: Toggle visibility of the label text (below the value)
- Label Color: Text color of the label text
- Label Font Size: Font size of the label text in pixels

## How to Use
1. Import the `.pbiviz` file into Power BI Desktop (from the Visuals pane -> ... -> Import from file).
2. Locate the visual in the Visualizations pane and add it to the report canvas.
3. Bind data to the data roles:
   - **Value**: Required numeric measure for the primary value
   - **Optional**: Category (for grouping and cross-filtering)
   - **Optional**: Target numeric measure for the target marker
   - **Optional**: Comparison numeric measure for the comparison marker
   - **Optional**: Minimum numeric measure for the gauge minimum (if not bound, auto-calculated)
   - **Optional**: Maximum numeric measure for the gauge maximum (if not bound, auto-calculated)
4. Use the format pane to adjust appearance:
   - Set gauge type, thickness, animation, and border
   - Configure zone boundaries, colors, gradient, and callouts
   - Set target and comparison markers (style, color, label)
   - Choose value display style, formatting, and label
5. Interact:
   - Click the gauge to cross-filter other visuals by the category (if bound)
   - Hover to see a tooltip with value, target, comparison, and zone
   - Right-click for the context menu

## Limitations
- The visual expects numeric values for Value, Target, Comparison, Minimum, and Maximum. Non-numeric values are treated as zero.
- If Value is not bound or contains no valid numeric data, the visual displays an empty state.
- Minimum and Maximum, if not bound, are auto-calculated as: min = min(value, target, comparison) * 0.8, max = max(value, target, comparison) * 1.2 (with a minimum range of 1).
- Zone 1 End and Zone 2 End must be numeric and within the gauge range (min to max); if not, they are clamped.
- Each data role accepts only one field.
- The visual uses a data reduction algorithm (top 30,000 rows) which may limit the number of rows displayed (only the first row is used for the gauge).
- The visual does not support drill-through or bookmark selection.
- In high contrast mode, colors are forced to foreground/background for accessibility.

## Support
For help or questions, visit https://nexuscodex.nexus/support