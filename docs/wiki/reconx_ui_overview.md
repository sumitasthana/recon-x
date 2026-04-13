# `reconx-ui/` — React Demo UI

## Purpose

A standalone React 18 single-page application that visualises a live reconciliation run in the browser. The UI animates the four-step pipeline, streams thinking messages with skill badges, and renders the final break report with expandable cards, a score ring, and a punchline callout about the silent exclusion break.

The UI can run in **standalone demo mode** (all data hardcoded in `src/data/reconxSteps.js`) or connected to the FastAPI backend for live runs.

---

## Tech stack

| Layer | Choice |
|-------|--------|
| Framework | React 18 |
| Bundler | Vite 5 |
| Styling | Tailwind CSS 3 (custom dark theme) |
| Icons | Lucide React |
| Font | JetBrains Mono (Google Fonts) |
| State | `useState` + `useEffect` + `useRef` (no Redux) |

---

## Project structure

```
reconx-ui/
├── index.html                  ← Vite entry, loads JetBrains Mono
├── vite.config.js              ← React plugin, dev server port 5173
├── tailwind.config.js          ← Dark surface palette, rx-pulse animation
├── postcss.config.js
├── package.json
└── src/
    ├── index.jsx               ← ReactDOM.createRoot
    ├── index.css               ← Tailwind directives + keyframes + badge classes
    ├── App.jsx                 ← Page shell, timer state machine, layout
    ├── data/
    │   └── reconxSteps.js      ← Hardcoded SKILLS, STEPS, BREAKS arrays
    └── components/reconx/
        ├── ReconContext.jsx     ← 3-zone source ↔ agent ↔ target flow panel
        ├── SkillShowcase.jsx    ← Sidebar skill cards with tier badges
        ├── StepCard.jsx        ← Animated step card with ThinkingStream
        ├── ThinkingStream.jsx  ← Scrolling message log with skill badges
        ├── BreakCard.jsx       ← Expandable break detail card
        ├── ScoreRing.jsx       ← Animated SVG score arc
        └── BreakReport.jsx     ← Findings panel with metrics + break cards
```

---

## Running locally

```bash
cd reconx-ui
npm install
npm run dev       # http://localhost:5173
```

Production build:

```bash
npm run build     # output to reconx-ui/dist/
npm run preview   # serve production build locally
```

---

## Demo flow

1. **Page load** — Dark theme loads immediately (no white flash). `ReconContext` panel shows the data flow story. Idle hint text prompts user to start.
2. **"Start reconciliation"** — `startRun()` fires. Timer interval starts at 80ms. `phase` = `"running"`.
3. **Steps animate** — Every 6.5 seconds, the next `StepCard` becomes active. `ThinkingStream` reveals messages at their configured `delay` offsets. Skill pills on the step card light up as messages with matching `skill` IDs appear.
4. **After ~26s** — All four nodes complete. `phase` = `"done"`. `BreakReport` fades in and auto-scrolls into view.
5. **Report** — Score ring animates from 0 to 60. Four `BreakCard` components stagger in (120ms each). BRK-004 has the purple "Invisible in logs" badge. The "What made this possible" callout explains the punchline.
6. **"Run again"** — Immediately resets all state and replays from step 1.

---

## Color palette

Defined in `tailwind.config.js`:

| Token | Value | Usage |
|-------|-------|-------|
| `surface` | `#0f0f10` | Page background |
| `surface-card` | `#18181b` | Card backgrounds |
| `surface-hover` | `#1e1e21` | Hover state |
| `surface-border` | `#27272a` | Borders |

---

## Animation keyframes (`index.css`)

| Name | Effect | Used by |
|------|--------|---------|
| `rx-pulse` | Scale + fade out | StepCard green pulse ring |
| `rx-dot` | Scale + opacity bounce | ThinkingStream pending dots |
| `rx-fadein` | Opacity + translateY | BreakCard stagger, BreakReport entry |

---

## Tailwind badge utilities (`index.css`)

```css
.badge-error  { bg-red-500/10, text-red-400, border-red-500/20 }
.badge-warn   { bg-amber-500/10, text-amber-400, border-amber-500/20 }
.badge-info   { bg-blue-500/10, text-blue-400, border-blue-500/20 }
```

---

## Responsive breakpoints

| Width | Layout |
|-------|--------|
| ≥ 768px | 2-column: steps left, skill showcase right |
| < 768px | Single column, skill showcase below steps |
| < 640px | ReconContext zones stack vertically |
| < 768px | Metric grid becomes 2-column (was 4-column) |
