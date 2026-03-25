# UI/UX Design System - Global Guardrail

This directive defines the mandatory design system for the entire application. All current and future UI changes MUST follow these rules consistently across all modules.

## Tone and Voice
- **Modern, clean, premium B2B software** (Stripe, Vercel, Linear).
- **Professional**, not playful.
- **Elegant**, not flashy.
- **Avoid** generic admin template appearances.

## Typography
- **Font Face:** [Montserrat](https://fonts.google.com/specimen/Montserrat) (Global).
- **Hierarchy:**
    - `h1`: Page titles (Bold, tracking-tight).
    - `h2`: Section titles (Semi-bold, slate-800).
    - `Label`: Form labels (Medium, uppercase/subtle, text-xs).
    - `Helper`: Helper text (Muted-foreground, text-xs).
    - `Table`: Table content (Clean, readable spacing).

## Color System
- **Backgrounds:** Refined `slate` (e.g., slate-50 for secondary bg, white for cards).
- **Sidebar:** Dark `slate-950` with clean active states.
- **Primary Action:** `indigo` (Indigo-600/700).
- **Borders:** Subtle `slate-200`.
- **Text:** `slate-900` for primary, `slate-500` for secondary.
- **Avoid:** Pure black (#000) and pure white (#FFF) where soft alternatives are possible.

## Core Component Rules

### Layout
- **Spacing:** Use consistent vertical rhythm (Standard: 4, 6, 8, 12 gaps).
- **Grouping:** Use Cards and consistent Sections to organize content.
- **Alignment:** Consistent left-alignment across all screens.

### Sidebar
- Clear active state with subtle highlights.
- Elegant spacing and vertical icon alignment.
- Clean user profile/session section at the bottom.

### Cards
- **Rounded corners:** `rounded-xl` or `rounded-lg` (not exaggerated).
- **Shadows:** Soft `shadow-sm` or `shadow-md`.
- **Padding:** Clean internal padding (`p-6` for main cards).
- **Separation:** Clear line separation between header and content if needed.

### Buttons
- **Variants:**
    - `primary`: Indigo background, white text.
    - `secondary`: Slate background, slate-900 text.
    - `ghost`: No background, slate-600 text (hover state required).
    - `destructive`: Red-600 background, white text.
- **Hover:** Smooth transitions (0.2s duration).

### Forms
- Clean grouping with fieldsets or spacing.
- Refined Input styles (consistent border, soft focus ring).
- Clear labels and tactical helper text.

### Tables
- **Header:** Uppercase, weight-semibold, text-slate-500.
- **Rows:** Good spacing, hover highlight.
- **Indicators:** Use Status Badges (Pills) for states.

### Empty States
- Must be designed with: **Icon**, **Title**, **Helper Text**.
- Should guide the user toward an action (CTA).

## Template Builder UI
- **Professional Tool:** Clear separation between Canvas and Properties Panel.
- **Controls:** Organized into collapsed/expandable sections.
- **Hierarchy:** Property labels must be distinct from values.

## Consistency Rule
- **NEVER** introduce random styles.
- **ALWAYS** reuse existing UI patterns and styled components.
- **NEVER** use unstyled default browser components.
