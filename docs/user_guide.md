# User Guide: pbiZoneGauge

## Adding the Visual
1. In Power BI Desktop, navigate to the Visualizations pane.
2. Click the three dots (⋯) and select "Get more visuals".
3. Search for "pbiZoneGauge".
4. Select the visual and click "Add".
5. The visual icon will appear in the Visualizations pane. Click it to add an instance to your report.

## Data Binding
The visual supports the following data fields (drag fields from the Fields pane to these wells):

| Field Name | Type | Required? | Description |
|------------|------|-----------|-------------|
| Category | Grouping | No | Optional grouping column. When bound, clicking the gauge filters other visuals by this category. |
| Value | Measure | Yes (numeric) | The primary value to display on the gauge. |
| Target | Measure | No (numeric) | Target value to show as a marker on the arc. |
| Comparison | Measure | No (numeric) | Optional secondary value (e.g. previous period) shown as a marker on the arc. |
| Minimum | Measure | No (numeric) | Minimum value of the gauge scale. |
| Maximum | Measure | No (numeric) | Maximum value of the gauge scale. |

**Note**: At least the Value field must be bound to display the gauge. If Minimum and Maximum are not bound, the gauge will auto-calculate the scale based on the Value and Target (if present).

## Formatting Options
The visual provides extensive formatting options in the Format pane:

### Visual Title
- **Show Title**: Toggle to display the title bar.
- **Title Text**: Custom title text.
- **Font Family**: Select font for the title.
- **Font Size**: Set title size in points.
- **Bold**: Toggle bold styling.
- **Italic**: Toggle italic styling.
- **Underline**: Toggle underline styling.
- **Alignment**: Left, center, or right.
- **Font Color**: Choose title text color.

### Gauge Settings
- **Gauge Type**: Choose the gauge shape: Semi-circle, Three-quarter, or Arc.
- **Thickness**: Thickness of the gauge arc in pixels.
- **Animation Duration**: Duration of the value change animation in milliseconds.
- **Show Border**: Toggle to display the outer border of the gauge.
- **Border Color**: Color of the outer border.
- **Border Width**: Width of the outer border in pixels.

### Zones
- **Zone 1 End**: Value at which zone 1 (danger) ends and zone 2 (warning) starts.
- **Zone 1 Color**: Color for zone 1 (typically red for danger).
- **Zone 2 End**: Value at which zone 2 (warning) ends and zone 3 (success) starts.
- **Zone 2 Color**: Color for zone 2 (typically orange/yellow for warning).
- **Zone 3 Color**: Color for zone 3 (typically green for success).
- **Use Gradient**: Toggle to use a gradient fill for the zones instead of solid colors.
- **Show Zone Labels**: Toggle to display labels for each zone.
- **Zone Label Position**: Choose where the zone labels appear: On the arc band, Outside the outer edge, or Inside the inner edge.
- **Zone 1 Label**: Text for the zone 1 label (e.g., "Danger").
- **Zone 2 Label**: Text for the zone 2 label (e.g., "Warning").
- **Zone 3 Label**: Text for the zone 3 label (e.g., "Success").
- **Zone Label Font Size**: Font size for the zone labels in pixels.

### Comparison
- **Show Comparison Marker**: Toggle to display the comparison value marker.
- **Comparison Style**: Choose the style of the comparison marker: Line or Marker.
- **Comparison Color**: Color of the comparison marker.
- **Comparison Label**: Label for the comparison marker (e.g., "Previous").

### Target
- **Show Target**: Toggle to display the target value marker.
- **Target Style**: Choose the style of the target marker: Line, Marker, or None.
- **Target Color**: Color of the target marker.

### Value Display
- **Value Style**: Choose how to display the value: Arc (fill arc to value), Needle (tachometer style), or Both.
- **Needle Color**: Color of the needle (if Value Style is Needle or Both).
- **Show Value**: Toggle to display the value as text.
- **Value Format**: Choose display format: Number or Percent.
- **Decimal Places**: Number of decimal places to show for numeric values.
- **Value Color**: Color of the value text.
- **Value Font Size**: Font size for the value text in pixels.
- **Show Label**: Toggle to display the label (e.g., units) below the value.
- **Label Color**: Color of the label text.
- **Label Font Size**: Font size for the label text in pixels.

## Features
- **Gauge Types**: Semi-circle (180°), Three-quarter (270°), or Arc (300°) for different visual styles.
- **Zones**: Configurable colored zones (danger, warning, success) with optional gradient and labels.
- **Target and Comparison**: Show target and/or comparison values as markers on the gauge.
- **Value Display**: Display the value as an arc fill, a needle, or both, with optional text label.
- **Cross-Filtering**: When a Category field is bound, clicking the gauge filters other visuals by that category.
- **Tooltips**: Hover over the gauge to see a tooltip with the value, target, comparison, and zone information.
- **Context Menu**: Right-click the visual to access the standard Power BI context menu.
- **High Contrast Mode**: Automatically adapts to high contrast settings for accessibility.
- **Animations**: Smooth animation when the value changes (configurable duration).
- **Responsive Design**: The gauge scales to fit the container while maintaining aspect ratio.

## Limitations
- The gauge displays a single value (the first row if multiple rows are bound to Value).
- The Target, Comparison, Minimum, and Maximum fields must be numeric if bound.
- The visual does not support drill-through or drill-down.
- The visual does not support conditional formatting via data fields.
- The zone boundaries (Zone 1 End and Zone 2 End) must be within the Minimum and Maximum range.
- The visual does not support multiple gauges in a single visual (one value per visual).

## Known Issues
None reported.

## Support URL
For support, visit: https://nexuscodex.nexus/support