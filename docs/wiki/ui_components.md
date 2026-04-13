# UI Components Reference

All components live in `reconx-ui/src/components/reconx/`. All data is imported from `src/data/reconxSteps.js` — no props carry raw strings or arrays.

---

## `App.jsx` — Page Shell

The top-level component. Owns the entire reconciliation state machine.

### State

| State | Type | Description |
|-------|------|-------------|
| `phase` | `"idle" \| "running" \| "done"` | Overall run phase |
| `currentStep` | `number` | Active step index (−1 when idle/done) |
| `statuses` | `string[4]` | Per-step status: `"pending"`, `"running"`, `"done"` |
| `elapsed` | `number` | Milliseconds since run started |
| `showReport` | `boolean` | Whether `BreakReport` is visible |

### Refs

| Ref | Purpose |
|-----|---------|
| `timerRef` | `setInterval` ID — cleared on completion and unmount |
| `startRef` | `Date.now()` at run start — used for elapsed calculation |
| `reportRef` | DOM node of the report section — target for `scrollIntoView` |

### Timer logic

- `setInterval` at 80ms — updates `elapsed` state
- `useEffect` on `[elapsed, phase, currentStep]` — computes `stepIndex = floor(elapsed / 6500)` and advances `currentStep` and `statuses` accordingly
- When `stepIndex >= STEPS.length`: clears interval, sets `phase = "done"`, triggers `showReport` after 300ms and scroll after 400ms

---

## `ReconContext.jsx` — Data Flow Panel

Renders the 3-zone horizontal panel showing Source → Agent → Target data flow.

### Zones

| Zone | Content |
|------|---------|
| **Source** (blue, left 35%) | Source system name, position count, asset list with blue dots |
| **Connector** (center 10%) | Animated SVG dashed line, "ReconX compares" label |
| **Target** (purple, right 35%) | Regulatory engine name, processing steps list |

**Bottom row:** 10 FR 2052a table pills, color-coded by category:
- `inflow` → blue
- `outflow` / `income` → amber
- `supplemental` → teal
- `balance` → zinc

**Responsive:** `flex-col` on mobile (<640px), `flex-row` with fixed height on wider screens.

---

## `SkillShowcase.jsx` — Skill Sidebar

Renders 4 skill cards using `SKILLS` from `reconxSteps.js`.

Each card shows:
- **Icon** (emoji) + **label** + **tier pill** (right-aligned)
- **Description** text in a muted shade of the skill color

Below the cards: a "Reusability" callout explaining the modular architecture.

**Skill tier colors:**
- Domain (FR 2052a) → `#185FA5` (blue)
- Platform (Snowflake) → `#0F6E56` (green)
- Platform (AxiomSL) → `#534AB7` (purple)
- Client (BHC-Alpha) → `#854F0B` (amber)

---

## `StepCard.jsx` — Reconciliation Step Card

Props: `{ step, status, elapsed, stepIndex, totalSteps }`

### Status rendering

| Status | Pulse indicator | Card border | Body |
|--------|----------------|-------------|------|
| `pending` | Empty circle (zinc-600) | Subtle zinc | Nothing |
| `running` | Animated green ring (opacity 0.08 glow) | Green 1.5px + glow | `ThinkingStream` |
| `done` | Solid green checkmark | Zinc | "Complete" row |

### Skill pill sync

`getActiveSkillId()` finds the latest visible message (by `delay <= elapsed`) and returns its `skill` field. A pill is highlighted when:
```
isActive = (status === "done") || (activeSkillId === skillId)
```

This ensures pills stay lit permanently once the step completes.

---

## `ThinkingStream.jsx` — Message Log

Props: `{ messages, elapsed }`

Renders messages whose `delay <= elapsed`. Each message row:
- Green 6px dot (left)
- Monospace message text (latest message: zinc-100, others: zinc-300 at 55% opacity)
- Optional skill badge (colored pill with icon) if `msg.skill` is set

**Auto-scroll:** `useEffect` on `visibleMessages.length` — scrolls to bottom only when a new message appears (not on every tick).

**Pending indicator:** Three bouncing green dots appear when `visibleMessages.length < messages.length`.

---

## `BreakCard.jsx` — Expandable Break Card

Props: `{ brk, animDelay }`

Collapsed view shows:
- Severity badge (`badge-error` for HIGH, `badge-warn` for MEDIUM)
- "Invisible in logs" badge for BRK-004 (purple `#534AB7`)
- Area label
- Impact amount + position count (right-aligned)
- Break title + headline
- Chevron expand hint

Expanded view (animated fade-in) adds:
- Detail paragraph
- 2-column grid: **Root cause** | **Detection method**

Left border color comes from `brk.color` (#E24B4A for HIGH, #BA7517 for MEDIUM).

Stagger: `animation: rx-fadein 0.4s ease-out ${animDelay}s both`

---

## `ScoreRing.jsx` — Animated SVG Score Arc

Props: `{ score, show }`

SVG structure:
1. Background circle — stroke `#3f3f46` (zinc-700)
2. Score arc — `rotate(-90deg)` on the arc element only (starts at 12 o'clock), animated `stroke-dashoffset` over 1.8s

When `show = false`: `strokeDashoffset = circumference` (invisible). When `show = true`: `strokeDashoffset = circumference × (1 − score/100)`.

Color thresholds:
- ≥ 80 → `#22c55e` (green) — "Clean"
- ≥ 60 → `#f59e0b` (amber) — "Action needed"
- < 60 → `#E24B4A` (red) — "Critical"

---

## `BreakReport.jsx` — Findings Panel

Props: `{ visible }`

Returns `null` when `visible = false`. Fades in with `rx-fadein 0.5s ease-out`.

Layout:
1. **Metric grid** (4-col desktop, 2-col mobile):
   - "Source positions" — 500
   - "Target loaded" — 477
   - "Breaks found" — 4 (red highlight)
   - `ScoreRing` — score 60, show = visible
2. **Break cards** — 4 `BreakCard` components from `BREAKS`, staggered at 120ms each
3. **"What made this possible" callout** — purple left border (`2px solid #534AB7`), explains how the silent filter break was found by reading XML config directly

---

## `reconxSteps.js` — Demo Data

Exports three constants (no React imports):

### `SKILLS` — 4 entries
```js
{ id, label, tier, icon, desc, color, bg }
```

### `STEPS` — 4 entries
```js
{ id, label, subtitle, skills: [skillId], messages: [{ text, delay, skill? }] }
```
`delay` is milliseconds from step start when this message should appear.

### `BREAKS` — 4 entries
```js
{ id, title, severity, area, headline, detail, impact, positions, root, color }
```
