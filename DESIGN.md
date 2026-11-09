---
name: Flown
description: Nonprofit employee workspace, a calm glass-layered all-in-one app.
colors:
  brand-sky: "#5695FA"
  brand-blue: "#2569F5"
  brand-deep: "#1f59d1"
  brand-tint: "#eff5ff"
  brand-wash: "#dce9ff"
  rail-slate: "#0f172a"
  canvas-slate: "#f1f5f9"
  surface-white: "#ffffff"
  ink: "#0f172a"
  ink-muted: "#64748b"
  line: "#e2e8f0"
  danger: "#e11d48"
  danger-tint: "#fff1f2"
  caution-tint: "#fffbeb"
  success: "#047857"
  dark-canvas: "#000000"
  dark-surface: "#111111"
typography:
  display:
    fontFamily: "Plus Jakarta Sans, Inter, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 700
    lineHeight: 1.25
  title:
    fontFamily: "Plus Jakarta Sans, Inter, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 600
    lineHeight: 1.4
  body:
    fontFamily: "Plus Jakarta Sans, Inter, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Plus Jakarta Sans, Inter, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 500
    lineHeight: 1.33
rounded:
  md: "6px"
  lg: "8px"
  xl: "12px"
  2xl: "16px"
  3xl: "24px"
  full: "9999px"
spacing:
  sm: "8px"
  md: "16px"
  lg: "24px"
components:
  button-primary:
    backgroundColor: "{colors.brand-blue}"
    textColor: "{colors.surface-white}"
    rounded: "{rounded.xl}"
    padding: "8px 16px"
  button-primary-hover:
    backgroundColor: "{colors.brand-deep}"
  rail-item:
    backgroundColor: "{colors.rail-slate}"
    textColor: "{colors.ink-muted}"
    rounded: "{rounded.2xl}"
    padding: "12px"
  rail-item-active:
    backgroundColor: "{colors.brand-blue}"
    textColor: "{colors.surface-white}"
  card:
    backgroundColor: "{colors.surface-white}"
    textColor: "{colors.ink}"
    rounded: "{rounded.2xl}"
    padding: "16px"
---

# Design System: Flown

## Overview

### Workspace consistency

Workspace pages share tokens in `src/index.css`: 24px page padding on desktop
(16px on mobile), 20px panel padding (16px on mobile), 12px panel corners, and
8px control corners. Primary header and toolbar controls are 40px tall on
desktop and 44px on mobile. Use `workspace-page-header`, `workspace-page-body`,
`workspace-panel`, `workspace-toolbar`, and `workspace-control` for new surfaces.
Scoped legacy utility rules keep existing screens aligned; circular avatars and
pill controls retain their shape.

Page headers use a concise title, not instructional or marketing subtitles.
Keep record metadata, validation guidance, loading/errors, and necessary metric
timeframes visible; detailed explanations belong in documentation or disclosures.

**Creative North Star: "The Glass Workbench"**

Flown is a workspace you work *on*: a dark slate rail anchors the left edge while pale, frosted surfaces float over a soft slate canvas. Depth comes from translucency and blur rather than hard borders, and a single blue accent marks what is active or actionable. A touch of the "tidy studio" lives in the generously rounded corners and compact, friendly controls, but the glass layering leads.

Density is high and utilitarian: most text is 12px, with small 10-11px metadata. The goal is an organized, modern, good-looking tool that holds many features (chat, email, drive, finance, programs, legal) without feeling cluttered. Light is the default; a true-black dark theme and a user-selectable accent (`--brand-accent`) are supported.

**Key Characteristics:**
- Dark slate navigation rail against light frosted content surfaces
- One blue accent, user-overridable via `--brand-accent`
- Translucent white surfaces with backdrop blur
- Large, consistent corner radii (xl and 2xl dominate)
- Compact type scale led by 12px text

## Colors

A restrained blue-and-slate palette with semantic rose, amber and emerald reserved for status.

### Primary
- **Flown Blue** (#2569F5): primary actions, active rail item, selected states. Overridable at runtime through `--brand-accent`.
- **Sky Blue** (#5695FA): brand-400/500; accents, links and highlights in dark mode.
- **Deep Blue** (#1f59d1): hover and pressed state for primary.

### Neutral
- **Rail Slate** (#0f172a, slate-900): navigation rail, at 95% opacity with blur.
- **Canvas Slate** (#f1f5f9, slate-100): app background.
- **Surface White** (#ffffff): cards, panels and popovers, often at 70-95% opacity.
- **Ink** (#0f172a) and **Muted Ink** (#64748b): primary and secondary text.
- **Hairline** (#e2e8f0): borders and dividers.
- **Dark Mode:** semantic tokens in `index.css` (`--surface-canvas` #0a0e15, `--surface-raised` #121823, `--surface-tint` #16213a, `--surface-hover` #1b2535, `--line` #263246), text `--text-strong` #f1f5f9, `--text-body` #cbd5e1, `--text-muted` #9aa8bd. Status colors keep their own hue (`--danger-*`, `--ok-*`, `--warn-*`).

### Semantic
- **Rose** (rose-50/500/600/700): errors and destructive actions; the most used status color.
- **Amber** (amber-50): warnings and caution.
- **Emerald** (emerald-700): success.

### Named Rules
**The One Accent Rule.** Blue is the only brand color. Status colors appear only to communicate state, never decoratively.

## Typography

**Display / Body Font:** Plus Jakarta Sans (with Inter, system sans fallbacks)

**Character:** Friendly geometric sans with a modern, approachable tone; weights 400-700 are loaded (system sans is the fallback).

### Hierarchy
- **Display** (700, 1.5rem, 1.25): page titles and empty states.
- **Title** (600, 1.125-1.25rem, 1.4): panel and modal headings.
- **Body** (400-500, 0.875rem, 1.5): message text, form content.
- **Label** (500-600, 0.75rem): the dominant UI size for lists, buttons, metadata and chips.

### Named Rules
**The Small-Text Discipline Rule.** 12px (`text-xs`) is the floor and the workhorse; nothing renders below it. Sizes snap to the four roles above (12 / 14 / 18 / 24), with `text-base` (16px) for mobile inputs.

## Layout

An app-shell: a fixed 72px rail on the left, a 64px (h-16) top bar, and a scrolling content region. The body is `overflow-hidden`, so each pane scrolls independently. Spacing follows Tailwind's 4px scale, with 16-24px padding on panels. Scrollbars are slim (5px) and translucent. The shell must adapt to desktop, web and mobile widths.

## Elevation & Depth

Layered: soft ambient shadows plus frosted blur. Bars and popovers use translucent white with `backdrop-blur-xl`, and large shadows appear only on floating overlays.

### Shadow Vocabulary
- **Glass** (`box-shadow: 0 8px 32px 0 rgba(31,38,135,0.07)`): cards and panels at rest.
- **Glass Hover** (`0 12px 40px 0 rgba(31,38,135,0.12)`): hovered cards.
- **Subtle** (`0 2px 10px rgba(0,0,0,0.04)`): small controls and inputs.
- **Floating** (`shadow-2xl`): popovers, menus, modals.
- **Brand Glow** (`shadow-lg shadow-brand-600/30`): the active rail item.

### Named Rules
**The Floating-Only Rule.** Heavy shadows (xl, 2xl) belong to overlays that float above the page. In-flow surfaces stay on glass or subtle shadows.

## Shapes

Soft, rounded forms. `rounded-lg` (8px) is the most common radius, then `rounded-xl` (12px) for controls and `rounded-2xl` (16px) for cards, rail items and popovers. `rounded-3xl` is for large modals and `rounded-full` for avatars and pills. Borders are 1px hairlines at partial opacity.

## Components

### Buttons
- **Shape:** rounded-xl (12px)
- **Primary:** Flown Blue fill, white text, roughly 8px 16px padding.
- **Hover / Focus:** darkens to Deep Blue with a `transition-all` ease.
- **Secondary / Ghost:** white or transparent with a slate border and slate text; hover tints to slate-50.

### Cards / Containers
- **Corner Style:** 16px
- **Background:** translucent white, around 70-95% opacity
- **Shadow Strategy:** Glass at rest, Glass Hover on interaction
- **Border:** 1px slate-200 at partial opacity
- **Internal Padding:** 16-24px

### Inputs / Fields
- **Style:** white or slate-50 fill, 1px slate border, rounded-lg to xl.
- **Focus:** border shifts to the brand blue, often with a soft ring.
- **Error:** rose border and text.

### Navigation
- **Rail:** 72px wide, slate-900 with blur and a slate-800 right border. Items are icon-only 12px-padded rounded-2xl buttons; hover tints to slate-800 and active fills Flown Blue with a glow. Labels appear as dark tooltips to the right.
- **Top bar:** 64px high, white at 70% opacity, blurred, with a hairline bottom border.

### Popovers / Quick Create
Translucent white, rounded-2xl, `shadow-2xl`, backdrop-blur-2xl, animated in with fade and zoom (150ms).

## Do's and Don'ts

### Do:
- **Do** use Flown Blue only for actions, selection and active state.
- **Do** build floating surfaces from translucent white, a blur and a hairline border.
- **Do** keep radii on the existing scale (lg, xl, 2xl).
- **Do** use lucide-react icons at 16-20px.
- **Do** support both light and the true-black dark theme, and honor `--brand-accent`.

### Don't:
- **Don't** introduce a second brand color or decorative gradients.
- **Don't** put heavy shadows on in-flow cards.
- **Don't** use sub-12px text for primary content.
- **Don't** hard-code the accent hex where `brand-*` tokens or `--brand-accent` apply.
