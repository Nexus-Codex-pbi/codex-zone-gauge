# User Guide – Codex Zone Gauge
## Overview
Semi-circular gauge with configurable red/amber/green zones.
## 1. Adding the Visual
1. Import the `.pbiviz` file into Power BI Desktop
2. Locate the visual in the Visualizations pane
3. Drag it onto the report canvas
## 2. Data Binding
- **Category** (optional): Grouping column; clicking filters other visuals.
- **Value** (required): Numeric measure shown on the gauge arc.
- **Target** (optional): Numeric measure shown as target line/marker.
- **Comparison** (optional): Numeric measure shown as comparison marker.
- **Minimum** (optional): Numeric measure defining gauge minimum.
- **Maximum** (optional): Numeric measure defining gauge maximum.
## 3. Formatting Options
**Title Settings**
- Show Title
- Title Text
- Font Family
- Font Size
- Bold
- Italic
- Underline
- Alignment
- Font Color
**Gauge Settings**
- Gauge Type
- Thickness
- Animation Duration
- Show Border
- Border Color
- Border Width
**Zones**
- Zone 1 End
- Zone 1 Color (Danger)
- Zone 2 End
- Zone 2 Color (Warning)
- Zone 3 Color (Success)
- Gradient Zone Fills
- Show Zone Callouts
- Callout Position
- Zone 1 Callout
- Zone 2 Callout
- Zone 3 Callout
- Callout Font Size
**Comparison**
- Show Comparison Marker
- Comparison Style
- Comparison Color
- Comparison Label
**Target Settings**
- Show Target
- Target Style
- Target Color
**Value Display**
- Value Style
- Needle Color
- Show Value
- Value Format
- Decimal Places
- Value Color
- Value Font Size
- Show Label
- Label Color
- Label Font Size
## 4. Features
- Semi-circle, three-quarter, or arc gauge types
- Configurable danger/warning/success zones with optional gradients
- Interactive click-to-filter and cross-highlighting
## 5. Limitations
- Single category row; multiple rows aggregated to first; all measures must be numeric.
## 6. Support
For help or questions, visit https://nexuscodex.nexus/support
## Notes for Certification
Source: https://github.com/Nexus-Codex-pbi/codex-zone-gauge | API: 5.11.0 | License: MIT
Verify: sample PBIX pre-bound; format controls work; right-click context menu; click to cross-filter; hover tooltip; resize responsive.
Contact: Nexus Codex <support@nexuscodex.nexus>