# SHOWUP — DESIGN_SYSTEM.md

> **Note (18 Oct 2026, Next.js migration):** the live stylesheets are in `styles/`. `styles/main.css` / `styles/event.css` named below are reference copies, now in `archive/design-reference-styles/`. The supplied wheel picker replaced the documented stand-in in the live app; its scoped `twp-*` rules are in `styles/components/wheels.css`. Stand-in wheel details below remain historical design-reference material.

Document 2 of 4 · Read-only extraction · Source version `1792166501-1cda`

> **Paths:** this document uses the original handoff layout. See "Where things are now" at the top of `SOURCE_MANIFEST.md` for where each path lives today, and `SOURCE_MANIFEST.md` §16 for how the standalone copy is now split into files.

Every value here was copied from the implemented CSS and script. The complete stylesheets are exported verbatim alongside this document:

- `styles/main.css` — the `<style>` block of `project/Main.dc.html` (365 lines): the whole flow plus the shared system
- `styles/event.css` — the `<style>` block of `project/Event.dc.html` (sample event page)

**If this document and those files ever disagree, the files win.** Where the two stylesheets differ from each other, §9 lists every difference.

---

## 1. Tokens (resolved, copy-paste)

This is the exact `:root` block from both files. It is identical in both.

```css
:root {
  --red: #f01015;
  --red-button: #e00e13;
  --background: #fffbfa;
  --text-primary: #333333;
  --text-secondary: #888888;
  --text-muted: #666666;
  --surface: #ffffff;
  --control-line: #cfc4c2;
  --row-fill: rgba(51, 0, 0, 0.03);
  --selected: #f7f1f0; /* defined, not referenced anywhere */
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 24px;
  --space-6: 32px;
  --space-7: 48px;
  --space-8: 64px;
  --space-9: 96px;
  --radius-button: 999px;
  --radius-card: 14px; /* defined, not referenced anywhere */
  --radius-input: 12px;
  --radius-glass: 20px;
  --ease-out: cubic-bezier(0.2, 0.7, 0.2, 1);
  --motion-fast: 180ms;
  --motion-medium: 260ms;
  --font-primary: 'Manrope', sans-serif;
}
```

### 1.1 Literal values used outside the tokens

These are hard-coded in rules rather than tokenised.

| Value                             | Where                                                                     |
| --------------------------------- | ------------------------------------------------------------------------- |
| `#FFFBFA`                         | `body` background (duplicates `--background`)                             |
| `#333333`                         | `body` colour, focus outlines, input focus border, many component colours |
| `#000000`                         | `a:hover` colour                                                          |
| `#FFFFFF`                         | white text on red, `.name-title:focus` background, `.name-opt.is-on`      |
| `#9A9A9A`                         | `.text-btn:disabled` text                                                 |
| `#8A8080`                         | input placeholder                                                         |
| `#BDB3B2`                         | `.cal-day:disabled` text                                                  |
| `rgba(51,0,0,0.04)`               | `.cal-day:hover` background                                               |
| `rgba(51,0,0,0.045)`              | `.tl-track` background                                                    |
| `rgba(20,0,0,0.08)`               | `.scrim` (page dims to roughly 92%)                                       |
| `rgba(255,255,255,0.7)`           | `.input[readonly]`                                                        |
| `rgba(255,255,255,0.65)` / `0.75` | `.name-opt` / `.step-btn` backgrounds                                     |
| `rgba(255,255,255,0.94)`          | `.av-tip` background                                                      |

### 1.2 Ambient backdrop

The `.ambient` layer is fixed and full-page, sitting behind `.layer` (which has `z-index: 1`).

```css
.ambient {
  position: fixed;
  inset: 0;
  z-index: 0;
  pointer-events: none;
  background:
    radial-gradient(circle at 15% 10%, rgba(240, 16, 21, 0.04), transparent 55%),
    radial-gradient(circle at 85% 70%, rgba(255, 170, 160, 0.16), transparent 60%);
}
.layer {
  position: relative;
  z-index: 1;
}
```

---

## 2. Typography

The font is loaded in `<helmet>` with three tags:

```html
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="" />
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Manrope:wght@400..600&display=swap" />
```

The fallback is `sans-serif`. There is no other family. The root `.su` sets `font-size:16px; line-height:1.5; -webkit-font-smoothing:antialiased; -moz-osx-font-smoothing:grayscale`.

### 2.1 Type styles (Main / flow)

Sizes are given as mobile → ≥720px → ≥1024px.

| Class / element                                                                       | Size                                            | Weight                  | Line height     | Tracking               | Colour                                      |
| ------------------------------------------------------------------------------------- | ----------------------------------------------- | ----------------------- | --------------- | ---------------------- | ------------------------------------------- |
| `.display` (h1)                                                                       | 44 → 56 → 64px                                  | 400                     | 1.08            | −0.05em                | inherit `#333333`; also `text-wrap:balance` |
| `.name-title` (Create title input)                                                    | 44 → 56 → 64px                                  | 400                     | 1.1             | −0.05em                | `#333333`                                   |
| `.rec-time` (Best so far time)                                                        | 44 → 52 → 56px                                  | 400                     | 1.06            | −0.05em                | `.t2` part uses `--text-secondary`          |
| `.section-h`                                                                          | 30 → 34px                                       | 400                     | 1.15            | −0.035em               | inherit                                     |
| `.range-label`                                                                        | 24px                                            | 400                     | 1               | −0.035em               | `#333333`                                   |
| `.day-title`                                                                          | 22px (17px when `.is-slim`)                     | 500                     | 1.25            | −0.025em               | inherit                                     |
| `.comp-h`                                                                             | 21px                                            | 500                     | 1.25            | −0.025em               | inherit                                     |
| `.wordmark`                                                                           | 21px                                            | 600                     | 1               | −0.045em               | `--text-primary`; the "." is `--red`        |
| `.dr-go` (count number)                                                               | 28px                                            | 400                     | 1               | −0.03em                | `--text-primary`; `.is-best` uses `--red`   |
| `.f-link`                                                                             | 19 → 24px                                       | 500                     | 1.3             | −0.02em                | inherit                                     |
| `.f-sub`, `.ev-status`, `.j-org`                                                      | 17px                                            | 400                     | 1.5 (inherited) | 0                      | primary, primary, muted                     |
| `.w-item` (wheel)                                                                     | 17px                                            | 400; 500 when `.is-sel` | —               | 0                      | muted; `#333` when `.is-sel`                |
| Body, `.dr-day`, `.dr-time`, `.my-name`                                               | 16px                                            | 400 (`.my-name` 500)    | 1.5             | 0 (`.my-name` −0.01em) | `.dr-time` uses `--text-secondary`          |
| `.will-q`, `.step-t`, `.cal-title`                                                    | 16px                                            | 500                     | 1.5             | −0.01em                | inherit                                     |
| `.btn`, `.text-btn`                                                                   | 15px                                            | 500                     | 1 / inherit     | −0.015em               | see buttons                                 |
| `.seg-opt`                                                                            | 15px (13px slim on mobile, 14px slim at ≥720px) | 400; 500 when on        | —               | −0.01em                | `#333333`; white on red                     |
| `.kicker`                                                                             | 15px                                            | 500                     | —               | −0.01em                | primary                                     |
| `.eyebrow`, `.cond-text`, `.window-len`, `.quiet`, `.step-b`                          | 15px                                            | 400                     | —               | 0                      | muted (`.cond-text` primary)                |
| `.field-error`, `.form-error`                                                         | 15px                                            | 500                     | —               | 0                      | `--red`                                     |
| `.l-actions .text-btn`, `.add-range`, `.back-link`, `.ev-links .text-btn`, `.cal-nav` | 14px                                            | 400 (`.cal-nav` 500)    | —               | —                      | muted                                       |
| `.label`, `.status`, `.field-label`, `.wheel-label`, `.step-n`                        | 13px                                            | 500                     | 1.4             | 0                      | muted (`.field-label` `#333333`)            |
| `.label-red`                                                                          | 13px                                            | 500                     | 1.4             | 0                      | `--red`                                     |
| `.small`, `.sheet-note`                                                               | 13px                                            | 400                     | 1.5             | 0                      | muted                                       |
| `.tl-h` (hour ticks), `.cal-dow span`, `.my-role`                                     | 12px                                            | 500                     | 18px / 28px / — | 0                      | muted                                       |

Tabular numerals (`font-variant-numeric:tabular-nums`) are set on `.cal-day`, `.w-item`, `.tl-h`, `.dr-go` and `.step-n`.

### 2.2 Differences on the sample event page (`event.css`)

- `.display` is **46px**, line-height **1.06** at mobile; 56px and 64px at the breakpoints are unchanged.
- `.rec-time` is **46px** at mobile.
- `.comp-h` becomes **22px at ≥1024px**. The flow has no such rule.

---

## 3. Materials (glass)

### 3.1 Definitions

These are verbatim and shared by both files (except `.glass-control`, which only exists in Main).

```css
/* Clear glass — panels, cards, sheets */
.glass {
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.72), rgba(255, 255, 255, 0.45));
  -webkit-backdrop-filter: blur(28px) saturate(180%);
  backdrop-filter: blur(28px) saturate(180%);
  border: 1px solid rgba(255, 255, 255, 0.75);
  border-radius: var(--radius-glass);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.95),
    0 16px 48px rgba(80, 20, 20, 0.1);
}

/* Clear control glass — segmented tracks, pills, rows, wheels (Main only) */
.glass-control {
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.92), rgba(255, 255, 255, 0.55));
  -webkit-backdrop-filter: blur(16px) saturate(180%);
  backdrop-filter: blur(16px) saturate(180%);
  border: 1px solid rgba(255, 255, 255, 0.85);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 1),
    inset 0 -1px 2px rgba(60, 0, 0, 0.05),
    0 1px 2px rgba(60, 20, 20, 0.05),
    0 10px 28px rgba(80, 20, 20, 0.1);
}

/* Silver — selection and secondary controls */
.glass-silver {
  background: linear-gradient(180deg, #ffffff 0%, #f1eeef 38%, #dcd8da 50%, #e9e6e7 62%, #faf8f9 100%);
  border: 1px solid rgba(255, 255, 255, 0.9);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 1),
    inset 0 -1px 0 rgba(120, 105, 110, 0.25),
    inset 0 0 0 1px rgba(160, 145, 150, 0.12),
    0 1px 2px rgba(60, 40, 45, 0.1),
    0 6px 16px rgba(60, 40, 45, 0.1);
  color: #333333;
}

/* Red glass — red state of a glass component */
.glass-red {
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.35) 0%, rgba(255, 255, 255, 0.1) 45%, rgba(255, 255, 255, 0) 55%), #f01015;
  border: 1px solid rgba(255, 255, 255, 0.45);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.6),
    0 2px 8px rgba(240, 16, 21, 0.25);
  color: #ffffff;
}
```

### 3.2 Where each material is applied (from markup and script)

| Material         | Elements                                                                                                                                                                                                                                                                    |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.glass`         | Create calendar `.cal`; Respond day cards (`'day glass'`); fresh invite panel `.f-invite`; organiser invite panel `.e-share`; reminder panel `.reminder`; both sheets `.sheet`; sample page mobile sticky bar `.m-bar`                                                      |
| `.glass-control` | Segmented control tracks `.seg`; `.range-label`; "Your events" rows `.my-row`; wheel bodies `.wheel`                                                                                                                                                                        |
| `.glass-silver`  | Segmented thumb silver layer `.t-silver`; wheel selection band `.wheel-band`; selected calendar days (`.cal-day.is-on`); condition chips `.cchip`; avatars `.av`; dot-row dots `.dot` (the silver base of every dot); also **all `.btn-secondary`** (same gradient inlined) |
| `.glass-red`     | Segmented thumb red layer `.t-red` (visible when Favourite); timeline fill for Favourite (`'tl-fill glass-red'`); red dot overlay `.dot-red`                                                                                                                                |
| Not glass (flat) | `.btn-primary` (flat `--red-button`), red text (`.label-red`, `.dr-go.is-best`, the wordmark dot, errors)                                                                                                                                                                   |

The timeline "Free" fill is its own clear material and is not a shared class:

```css
.tl-fill.is-free {
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(255, 255, 255, 0.72));
  border: 1px solid #ffffff;
  box-shadow:
    inset 0 -1px 2px rgba(60, 0, 0, 0.06),
    0 2px 8px rgba(80, 20, 20, 0.14);
}
.tl-track {
  background: rgba(51, 0, 0, 0.045);
  border: 1px solid rgba(255, 255, 255, 0.85);
  box-shadow:
    inset 0 1px 3px rgba(60, 0, 0, 0.1),
    0 1px 0 rgba(255, 255, 255, 0.9);
}
```

---

## 4. Radii, borders, dividers

| Radius                    | Used by                                                                                                                                                                       |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 999px (`--radius-button`) | `.btn`, `.seg`, `.seg-thumb`, `.seg-opt`, `.range-label`, `.tl-track`, `.tl-fill`, `.cchip-btn`, `.name-opt`, `.av-tip` (`.text-btn` has no radius except its 4px focus ring) |
| 20px (`--radius-glass`)   | `.glass` panels and sheets (mobile sheet: `20px 20px 0 0`); `.cchip` uses a literal 20px                                                                                      |
| 18px                      | `.my-row`                                                                                                                                                                     |
| 16px                      | `.wheel`                                                                                                                                                                      |
| 12px (`--radius-input`)   | inputs, selects, `.num`, `.name-title`, `.wheel-band`, the `.tl:focus-visible` ring                                                                                           |
| 8px                       | `.f-qr`                                                                                                                                                                       |
| 6px                       | `.qr`; `.wordmark:focus-visible` ring                                                                                                                                         |
| 4px                       | `.text-btn:focus-visible` ring                                                                                                                                                |
| 50%                       | `.cal-day`, `.av`, `.dot`, `.dot-red`, `.step-btn`                                                                                                                            |

**There are no divider lines or rules.** The only borders are:

- glass edges (white, translucent)
- inputs: `1px solid var(--control-line)` (`#CFC4C2`), which becomes `#333333` plus a `0 0 0 1px #333333` ring on focus
- `.name-title`: transparent border, `#333333` on focus
- `.cal-day`: transparent border
- `.tl-track`: white edge

---

## 5. Interaction states

| Component        | Hover                                                    | Active        | Focus-visible                                 | Selected / on                                                                                        | Disabled                                          | Busy / error                                                             |
| ---------------- | -------------------------------------------------------- | ------------- | --------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------ |
| `.btn-primary`   | shadow → `0 6px 18px rgba(240,16,21,0.22)`               | `scale(0.97)` | `2px solid #333` outline, offset 3px          | —                                                                                                    | `opacity:.4; box-shadow:none; cursor:not-allowed` | `[aria-busy=true]`: `opacity:.8; cursor:progress`; label reads "Saving…" |
| `.btn-secondary` | `translateY(-2px)` plus a stronger silver shadow         | `scale(0.97)` | same as primary                               | —                                                                                                    | same as primary                                   | —                                                                        |
| `.text-btn`      | underline colour `rgba(51,51,51,.35)` → `#333`           | —             | `2px solid #333`, offset 2px, radius 4px      | —                                                                                                    | `#9A9A9A`, underline transparent                  | —                                                                        |
| `.seg-opt`       | —                                                        | —             | `2px solid #333`, offset 1px                  | `.is-on` weight 500 under the silver thumb; `.is-on-red` white text, weight 500, under the red thumb | —                                                 | —                                                                        |
| `.cal-day`       | `rgba(51,0,0,0.04)` background (not when on or disabled) | `scale(0.94)` | `2px solid #333`, offset 2px                  | `.glass-silver.is-on`, weight 600                                                                    | `#BDB3B2`, default cursor                         | `.is-today` weight 600                                                   |
| `.my-row`        | —                                                        | `scale(0.98)` | `2px solid #333`, offset 2px                  | —                                                                                                    | —                                                 | —                                                                        |
| `.range-label`   | —                                                        | `scale(0.97)` | offset 3px                                    | `aria-expanded=true` when its wheels are open (no visual change)                                     | —                                                 | —                                                                        |
| `.av`            | `translateY(-2px)`, `z-index:2`, tooltip shown           | —             | same plus outline, offset 2px                 | `.is-on` (tapped) same as hover                                                                      | —                                                 | —                                                                        |
| Inputs           | —                                                        | —             | border `#333` plus ring                       | —                                                                                                    | —                                                 | `.field-error` red text below                                            |
| `.wheel`         | —                                                        | —             | `.wheel:focus-within` 2px outline, offset 2px | `.w-item.is-sel` `#333`, weight 500                                                                  | —                                                 | —                                                                        |
| `.name-opt`      | —                                                        | —             | 2px outline, offset 1px                       | `.is-on` white background, weight 600                                                                | —                                                 | —                                                                        |
| `.step-btn`      | —                                                        | —             | 2px outline, offset 1px                       | —                                                                                                    | `opacity:.4`                                      | —                                                                        |
| `.cchip`         | —                                                        | —             | `.cchip-btn` outline                          | expanded shows `.cchip-edit`                                                                         | —                                                 | `.is-unknown` muted text ("Sam?")                                        |
| `.dr` (dot row)  | —                                                        | —             | —                                             | `.dr-go.is-best` red                                                                                 | —                                                 | `.is-dim` `opacity:.6` (0 would go, or nobody free)                      |
| `.wordmark`      | (Event: colour stays primary)                            | —             | 2px outline, offset 4px, radius 6px           | —                                                                                                    | —                                                 | —                                                                        |

Error copy appears in `--red` at 15px/500 via `.field-error` or `.form-error`. Live regions are used for status messages (`role="status"`, `aria-live="polite"`) and errors (`role="alert"`).

---

## 6. Layout

### 6.1 Breakpoints

- **Mobile:** below 720px. This is the default CSS.
- **Tablet:** `@media (min-width:720px)`.
- **Desktop:** `@media (min-width:1024px)`.
- **Mobile-only:** `@media (max-width:719px)` (Main only), which shows the short day label in slim cards.
- The canvas frames are 390px (mobile) and 1440px (desktop). No 768 or 1280 frames exist, but the media queries cover them.

### 6.2 Page container

```css
.wrap {
  width: 100%;
  max-width: 1328px;
  margin: 0 auto;
  padding-left: 20px;
  padding-right: 20px;
}
@media (min-width: 720px) {
  .wrap {
    padding-left: 40px;
    padding-right: 40px;
  }
}
@media (min-width: 1024px) {
  .wrap {
    padding-left: 64px;
    padding-right: 64px;
  }
} /* content width ≤ 1200px */
```

### 6.3 Header

`.header` is a flex row (space-between) with `padding-top` 24 → 32 → 40px and `padding-bottom` 8px. It carries `view-transition-name:su-header`, but only in Main.

On event pages (`.header-ev` in Main; `.header` in Event) it is a column at mobile, with the wordmark above the status and a 4px gap, and becomes a row at ≥720px.

### 6.4 Flow page grid (Landing, Create, Join, Respond)

```css
.page-main {
  padding-top: 40px;
  padding-bottom: 64px;
} /* ≥720: 64px / 96px; ≥1024: top 96px */
.col-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  row-gap: 32px;
}
@media (min-width: 720px) {
  .col-main {
    max-width: 680px;
  }
}
@media (min-width: 1024px) {
  .col-grid {
    grid-template-columns: repeat(12, minmax(0, 1fr));
    column-gap: 24px;
    row-gap: 48px;
  }
  .col-main,
  .col-intro {
    grid-column: 2 / 9;
    max-width: none;
  }
  .r-rail {
    display: block;
    grid-column: 10 / 13;
    grid-row: 2;
  } /* Respond "How this works" rail, sticky top:40px */
  .l-main {
    padding-top: 128px;
  } /* Landing only */
}
```

### 6.5 Event page grid (flow)

```css
.f-main {
  padding-top: 48px;
  padding-bottom: 64px;
} /* ≥720 top 64; ≥1024 top 96 */
.ev-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  row-gap: 64px;
}
@media (min-width: 1024px) {
  .ev-grid {
    grid-template-columns: repeat(12, minmax(0, 1fr));
    column-gap: 24px;
  }
  .ev-grid > * {
    grid-column: 1 / 8;
  }
  .ev-grid > .ev-title {
    grid-column: 1 / 9;
  }
  .ev-grid.is-full .ev-best {
    grid-row: 2;
  }
  .ev-grid.is-full .ev-dots {
    grid-row: 3;
  }
  .ev-grid.is-full .ev-people {
    grid-row: 4;
  }
  .ev-grid.is-full .ev-side {
    grid-column: 9 / 13;
    grid-row: 2 / span 3;
    align-self: start;
  }
  .ev-grid.is-full .ev-links {
    grid-row: 5;
  }
  .ev-actions {
    order: -1;
  }
}
```

Negative margins pull related lines closer inside the 64px row gap: `.ev-status` −32px, `.f-wait` −48px.

### 6.6 Sample event grid (`event.css`)

- `.e-grid`: one column with a 64px row gap.
- At ≥720px, `.e-side` becomes a two-column grid with gaps of 32px (rows) and 24px (columns).
- At ≥1024px the page uses 12 columns with a 24px gap:
  - `.e-title` spans columns 1/9 (row 1) with a 32px bottom margin.
  - `.e-rec`, `.e-dots` and `.e-people` span columns 1/8 in rows 2, 3 and 4.
  - `.e-side` spans columns 9/13, rows 2 / span 3, as a flex column with a 32px gap; `.e-actions` uses `order:-1`.
- The mobile sticky bar `.m-bar` is fixed 12px from the left, right and bottom (plus the safe-area inset), with 10px padding. It is hidden at ≥720px, where `.propose-inline` appears instead. `.e-foot` has 120px bottom padding on mobile and 48px from 720px.

### 6.7 Recurring component dimensions

| Element                  | Values                                                                                                                      |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| `.btn`                   | min-height 48px, padding 0 26px (secondary 0 24px); `.btn-sm` 44px, 0 20px                                                  |
| `.text-btn`              | min-height 44px, padding 0 2px                                                                                              |
| `.input` (textarea)      | min-height 96px, padding 12px 14px; `.sheet-input` min-height 76px                                                          |
| `.input-line`, `.select` | min-height 48px, padding 0 14px; `.input-lg` 56px, 18px font, padding 0 16px                                                |
| `.num`                   | width 80px, min-height 48px                                                                                                 |
| `.seg`                   | 3 equal columns, padding 3px; option min-height 42px (38px slim); thumb `calc((100% - 6px)/3)`                              |
| Slim card avail control  | 222px wide on mobile, 300px at ≥720px                                                                                       |
| `.will-row .seg`         | 300px at ≥720px; `.avail-seg` max 420px                                                                                     |
| `.day`                   | padding 20px (24px at ≥720px); slim 12/12/12/18px (14/14/14/22px at ≥720px)                                                 |
| `.tl-track`              | height 32px; fills inset 3px (`left: calc(x% + 3px); width: calc(w% - 6px)`, set inline); ticks 18px row, 6px above         |
| `.cal`                   | max-width 400px, padding 16px; day buttons 42×42px                                                                          |
| `.wheel`                 | 200px tall; item 40px; band at top 80px, height 40px, inset 6px; `.wheels` max-width 360px, two columns, 12px gap           |
| `.f-qr`                  | 136px (152px at ≥720px); `.qr` 96px                                                                                         |
| `.av`                    | 44px, overlap `margin-left:-10px`                                                                                           |
| `.dot`                   | 12px (14px at ≥720px), gap 8px                                                                                              |
| Dot row (`.dr`)          | mobile areas `"label num" / "dots dots"`; ≥720px columns `minmax(150px,240px) minmax(0,1fr) auto`, areas `"label dots num"` |
| `.sheet` (Main)          | mobile: full width, max-height 92vh, padding 28px 20px 24px, gap 24px; ≥720px: 500px wide, centred, padding 32px            |
| `.sheet` (Event)         | mobile padding 12px 20px 32px; ≥720px padding 24px 32px 32px                                                                |

---

## 7. Components: implemented styling, by source

All of these live in `project/Main.dc.html` unless marked **(E)** for `Event.dc.html`. Exact CSS is in `styles/*.css`; the line references are to `styles/main.css`.

- **Buttons** (lines 34–50): `.btn`, `.btn-primary` (flat, `--red-button`, `0 4px 14px rgba(240,16,21,0.16)`), `.btn-secondary` (silver), `.btn-sm`, `.text-btn`, `.text-btn-muted`, `.btn-row` (flex-wrap, gap 12px/24px).
- **Fields** (52–63): `.field`, `.field-label`, `.input`, `.input-line`, `.select`, `.num`, `.input-lg`, placeholder, readonly, errors.
- **Availability control and willingness control** (65–75): one segmented control used for both. Availability options are Not free / Free / Favourite. Willingness options are Yes / If… / No, and its thumb stays silver. The thumb position is set inline as `transform: translateX(0|100|200%)`. An empty willingness value gives `.is-empty` (opacity 0). Favourite gives `.is-red` (the red layer fades in over the silver one).
- **Day card** (161–175): `.day.glass`, `.is-slim` when Not free (a single row on mobile showing the short day label "Fri 23 Oct"), and `.reveal` (0fr → 1fr rows plus opacity over 260ms; `overflow` is released by the `reveal-unclip` keyframe after 260ms so shadows aren't clipped).
- **Timeline** (176–184): `.tl` (a single `<button>` wrapping track and ticks), `.tl-track`, `.tl-fill.is-free` / `.tl-fill.glass-red`, `.tl-h` (first tick left-aligned, last right-aligned).
- **Range label and wheels** (185–191, 77–90): `.range-label.glass-control` pill; `.range-wheels` appears inline below it. The live app now mounts the supplied picker with scoped `twp-*` classes; this source description records the previous stand-in.
- **Conditions summary** (194–196): `.cond-sum` with a `.label` prefix ("Only you see this: ") and `.cond-actions` text buttons.
- **Calendar** (134–148): `.cal.glass`, `.cal-head` (text month navigation), `.cal-dow` (M T W T F S S), `.cal-grid`, `.cal-day`, `.cal-blank`.
- **Your events rows** (118–125): `.my-row.glass-control`, a two-column grid of name and status on the left with the role label on the right.
- **Invite panels**: `.f-invite.glass` (fresh page: link text, Copy link, a 136/152px QR) and `.e-share.glass` (a compact grid with a 96px QR column; also in **(E)**).
- **Best so far** (220–224): `.label-red` heading, `.rec-time` (day plus `.t2` time in `--text-secondary`; stacked on mobile, inline with a comma at ≥720px), `.rec-date`, `.rec-viable` (`.comp-h`).
- **Dot rows** (225–241, also **(E)**): see §6.7. Each dot is `<span class="dot glass-silver"><span class="dot-red glass-red [is-on]"></span></span>`.
- **Avatars** (242–247, also **(E)**): `.av.glass-silver` with an `.av-tip` tooltip. **(E)** adds `.av.is-waiting` at `opacity:.55`.
- **Overlays and sheets** (261–289): `.overlay` (fixed, z-index 40; bottom-aligned on mobile, centred at ≥720px with 32px padding), `.scrim` (a `<button>` with tabindex −1), `.sheet.glass`. Conditions-sheet chips are `.cchip.glass-silver`, `.cchip-edit`, `.name-opt`, `.stepper` / `.step-btn` / `.step-val`; `.quiet` is the unsupported-input line. In the flow sheets, `.sheet-actions` is a right-aligned row with the Cancel text link followed by the primary button. **(E)**'s propose sheet instead uses `.sheet-head` (label plus Close) and a column of buttons on mobile, which becomes `row-reverse` at ≥720px.
- **Reminder and proposal blocks** (254–256): `.reminder.glass` and `.proposal` (plain text, no surface).

---

## 8. Motion

### 8.1 Tokens and CSS durations

- **Easing:** `--ease-out: cubic-bezier(.2,.7,.2,1)`. It is used for almost everything; reduced motion uses `linear`.
- **`--motion-fast` (180ms):** button transform, opacity and colour; text-button underline; input border; calendar day; my-row; avatar; tooltip.
- **`--motion-medium` (260ms):** button box-shadow; the reveal grid-rows, opacity and visibility; the `reveal-unclip` delay.

### 8.2 Transitions and animations

| Interaction                      | Implementation                                                                                                                                                                                                                                                              |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Segmented thumb slide            | `.seg-thumb` transform 220ms ease-out; red layer opacity 220ms; empty ↔ shown opacity 180ms; label colour 220ms                                                                                                                                                             |
| Day card expand/collapse         | `.reveal` grid-template-rows and opacity 260ms; `visibility` delayed 260ms on close                                                                                                                                                                                         |
| Timeline fill moves              | `.tl-fill` left, width and opacity 220ms                                                                                                                                                                                                                                    |
| Range wheels appear              | `.range-wheels` `s-in` 260ms                                                                                                                                                                                                                                                |
| More options appear              | `.more-body` `s-in` 260ms                                                                                                                                                                                                                                                   |
| Screen change (fallback)         | Leaving: `.s-head`, `.s-body` and `.vt-title` run `s-out` 160ms (to −8px, opacity 0); after a 160ms JS timeout the state swaps; entering: `.s-head` runs `s-in` 320ms (from +12px) and `.s-body` runs `s-in` 320ms with a 60ms delay                                        |
| Screen change (View Transitions) | `::view-transition-old(root)` runs `vt-out` 160ms; `new(root)` fades in over 160ms; the `su-title` group morphs over 400ms (the event-name element carries `.vt-title`); `su-header` is not animated; the new DOM's `.s-head`/`.s-body` also run `s-in` (`.is-entering-vt`) |
| Sheet open / close               | `.scrim` fades in 280ms; `.sheet` runs `sheet-in` 280ms (from +24px, opacity 0); closing adds `.is-closing`, running `fade-out` / `sheet-out` 200ms, after which JS removes the sheet at 200ms                                                                              |
| Condition chips appear           | `.cchip` `s-in` 220ms                                                                                                                                                                                                                                                       |
| Reminder / proposal blocks       | `s-in` 260ms (Main) or `rise` 260ms (E; identical keyframe values)                                                                                                                                                                                                          |
| Dots                             | Each `.dot` fades in over 200ms on mount; `.dot-red` opacity transitions over 200ms; on the first view per session the red layers fill left to right with `transition-delay = index × 40ms`                                                                                 |
| Dot row dim                      | `.dr` opacity 200ms                                                                                                                                                                                                                                                         |

### 8.3 JavaScript timings (Main unless marked)

| What                                                 | Value                                                           |
| ---------------------------------------------------- | --------------------------------------------------------------- |
| Fallback screen-leave delay before the state swap    | 160ms (0 with reduced motion)                                   |
| View Transition update-callback safety resolve       | 250ms                                                           |
| Simulated "Saving…" before submit completes          | 700ms                                                           |
| Condition auto-interpret debounce after typing stops | 600ms                                                           |
| Sheet removal after the close animation              | 200ms (150ms reduced)                                           |
| Focus return to the day after a sheet closes         | 30ms                                                            |
| Wheel scroll settle → commit nearest value           | 120ms                                                           |
| "Link copied." / "Reminder copied." message          | 2400ms; failure message 6000ms                                  |
| Dot fill start after mount                           | 80ms (E: 60ms), then delays are cleared after 1200ms (E: 900ms) |
| Dot fill once per session                            | `sessionStorage['showup-dots-seen']='1'`                        |

### 8.4 Reduced motion (`prefers-reduced-motion: reduce`)

From Main lines 353–365:

- Every transition becomes 1ms; every animation becomes 150ms with no delay.
- Screen enters become a plain `fade-in`; the leave animation is disabled.
- Sheets, wheels, more-body, chips, reminder and proposal use `fade-in`; a closing sheet uses `fade-out`.
- `.reveal` uses only a 150ms linear opacity transition, and its overflow is released immediately.
- Hover and press transforms are removed.
- View transitions become a 150ms linear crossfade with no title morph (`group(su-title){animation:none}`).
- In JS, `reduced()` makes dots start fully red and skips the 160ms fallback delay.

**(E)** has the equivalent subset: 1ms transitions, 150ms animations, `fade-in` / `fade-out` for sheet, reminder and proposal, and no transforms.

---

## 9. Every difference between `main.css` and `event.css` for shared selectors

| Selector                 | Main                                                                                                                          | Event                                                                                  |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `.header`                | flex row; `view-transition-name:su-header`                                                                                    | flex **column**, items start, gap 4px; no transition name; becomes a row at ≥720px     |
| `.wordmark`              | `<button>` reset (`padding:0; border:0; background:none; cursor:pointer; font-family`)                                        | `<a>`: `text-decoration:none`; plus `.wordmark:hover{color:var(--text-primary)}`       |
| `.display`               | 44px / 1.08 at mobile                                                                                                         | **46px / 1.06** at mobile                                                              |
| `.rec-time`              | 44px at mobile                                                                                                                | **46px**, explicit `color:var(--text-primary)`                                         |
| `.comp-h`                | 21px at all sizes                                                                                                             | **22px** at ≥1024px                                                                    |
| `.input-line,.select`    | includes `min-width:0`                                                                                                        | no `min-width`                                                                         |
| `.form-error`            | combined with `.field-error`                                                                                                  | standalone rule, same values                                                           |
| `.reminder`, `.proposal` | animation `s-in`                                                                                                              | animation `rise` (same keyframe values)                                                |
| `.sheet` (mobile)        | padding 28px 20px 24px                                                                                                        | padding 12px 20px 32px                                                                 |
| `.sheet` (≥720px)        | padding 32px                                                                                                                  | padding 24px 32px 32px                                                                 |
| `.sheet-actions`         | row, right-aligned, 24px gap                                                                                                  | column, 12px gap, full-width buttons; `row-reverse` at ≥720px                          |
| Event-only selectors     | —                                                                                                                             | `.e-*` layout, `.propose-inline`, `.m-bar`, `.e-foot`, `.av.is-waiting`, `.sheet-head` |
| Main-only selectors      | `.glass-control`, wheels, segmented control, calendar, day cards, timeline, chips, Landing, Create, Join and flow-event rules | —                                                                                      |

---

## 10. Computed contrast notes (measured from the values above, not design intent)

- White on `--red-button` `#E00E13` (primary buttons) is about 4.9:1.
- `--red` `#F01015` as 13px text on `#FFFBFA` ("Best so far", the red count) is about 4.2:1, **below WCAG AA 4.5:1 for small text**. This was specified by the brief and kept.
- White "Favourite" text on the red glass thumb is about 4:1 or a little less, because of the highlight. It is **below AA** and was kept as specified.
- `--text-muted` `#666666` on `#FFFBFA` is about 5.6:1.
- `--text-secondary` `#888888` is about 3.4:1. It is only used at 16px and up (time in dot rows, `.rec-time .t2`), so it passes the 3:1 large-text threshold only for the display-sized `.rec-time`; the 16px `.dr-time` is below AA.
