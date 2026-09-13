# UX Contract

## Information hierarchy
Desktop target hierarchy:
HEADER
CURRENT CROP OUTLOOK
MAIN DECISION WORKSPACE
REGION | MAP | VIEW / DECISION TOOLS
TEMPORAL CONTROL
CROP-STAGE TIMELINE
WHAT MATTERS NOW
MORE EVIDENCE (collapsed/progressive disclosure)
DATA & VALIDATION (collapsed/progressive disclosure)

This is an information hierarchy, not a fixed pixel design.

## Responsive contract
Phone: concise Current Crop Outlook, map, unified timeline, View & Tools control, What Matters Now, secondary information in drawers/bottom sheets, legend closed by default and never permanently covering meaningful geography.

Tablet: map remains dominant, Current Crop State beside or immediately below map, compact controls, regional interpretation accessible without excessive scrolling.

Desktop: full decision-support workspace with map dominance; region, view, and interpretation may coexist; technical evidence remains secondary.

## Legend contract
Phone legend defaults closed, can be opened and closed, updates with layer changes without reopening, and does not reopen on slider movement. Tablet legend is compact/collapsible. Desktop legend may persist if it does not interfere.

## Temporal-control contract
Play, speed, date slider, current date, and crop-stage position form one synchronized component. The slider drives displayed temporal layer, selected evidence date, crop stage, interpretation, change analysis, and relevant decision text.

## Temporal animation contract
No legend blinking, blank intermediate map, unexplained stale frame, date/map mismatch, or confusing abrupt replacement. Smoothness is a rendered visual requirement, not a CSS-property requirement.

## Density and duplication
Opening experience must not resemble a research report. Reduce card count, repeated headings, status badges, methodology prose, and technical controls. Every major concept has one primary home.

## Advanced controls
Raster opacity, station toggles, crop polygon toggles, source metadata, and validation diagnostics should generally be secondary under Evidence, Data & Validation, or Advanced Map Controls.
