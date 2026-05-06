# Accessibility Statement for pbiZoneGauge

## Keyboard Navigation
The visual supports keyboard focus (supportsKeyboardFocus: true). Users can navigate to the visual using the Tab key. When the visual has focus, users can activate the click-to-filter functionality (if a Category is bound) by pressing Enter or Space. The visual also supports the context menu via the keyboard (typically Shift+F10 or the context menu key) when focused.

## High Contrast Mode
The visual detects high contrast mode via the Power BI host's color palette (`colorPalette.isHighContrast`). In high contrast mode:
- The gauge border, zones, value arc, target line, comparison marker, and text elements are forced to use the foreground color from the palette for better contrast.
- The background of the visual is set to transparent to allow the system background to show through.
- The visual ensures that all interactive elements have sufficient contrast.

## Screen Reader Support
The visual uses SVG elements with appropriate text content and labels:
- The gauge is represented as an SVG with ARIA role="img" and an aria-label that describes the gauge (including the value, minimum, maximum, target, comparison, and zone information if available).
- The value text, label text, and zone callout labels are provided as SVG text elements, which are accessible to screen readers.
- The visual does not rely solely on ARIA because the text content is sufficient, but it enhances accessibility with aria-label on the SVG container.
- Screen readers will announce the aria-label for the gauge when focused.

## Color Usage
The visual conveys information through color in the following ways:
- The zones (danger, warning, success) use color to indicate performance levels.
- The value arc uses a solid color (by default) to show the current value.
- The target line and comparison marker use contrasting colors to indicate their values.
Users should ensure sufficient contrast between the zone colors and the background. The visual does not rely solely on color to convey information; the gauge also uses position (angle) along the arc to encode the value, target, and comparison.

## Animations
The visual uses animations for value transitions (when the value changes) and for gauge initialization. The animation duration is configurable via the Gauge Settings (Animation Duration). The animations are non-essential and can be reduced by setting the duration to 0. The visual respects the user's preference for reduced motion (if available) by checking the system settings and disabling animations if preferred.

## Text Scaling
The visual respects the user's text size settings through the use of `pt` units for font sizes in the SVG text elements (via D3.js). The visual does not override or disable the browser's text scaling capabilities. Text elements scale with the user's settings.

## Summary
pbiZoneGauge is designed to be accessible, supporting keyboard navigation, high contrast mode, and screen readers. The visual avoids relying solely on color for information and ensures text is legible in various viewing conditions. Animations can be reduced or disabled to respect user preferences.