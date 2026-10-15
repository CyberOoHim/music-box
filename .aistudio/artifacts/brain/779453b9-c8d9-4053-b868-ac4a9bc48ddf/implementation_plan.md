# 2D Music Box Visual Alignment for Recorded Video

Aligns the 2D horological mechanism in recorded videos to achieve an exact 1:1 visual and geometric match with the main page 2D blueprint (`MusicBoxMovement`), correcting part placements (mainspring, speed governor, gear train, cylinder, journal bearings) and restoring authentic wide graded steel comb tines with acoustic undercut and damper nibs.

## User Review & Critical Decisions

> [!IMPORTANT]
> The following directions were confirmed during interactive clarification and govern the plan:

- **Confirmed Decision 1 (Visual Alignment)**: Exact 1:1 visual match with identical layout, geometric coordinates ($780 \times 285$ horological blueprint), and comb anatomy matching the main page 2D view.
- **Confirmed Decision 2 (Frame Composition)**: Retain the parchment song title card on top while hosting the authentic $780 \times 285$ movement in the burl-walnut cradle below within the 720p HD frame.
- **Confirmed Decision 3 (Mechanical Animation Details)**: Full horological animation fidelity in the video canvas, including the spinning 4-blade governor butterfly fan, detent ratchet detents, revolving brass cylinder pins, tine tip deflection, contact sparks, and vibrating bass lead counterweights.

---

## 1. Overview & Core Concept

When users export or record performances to video, the rendered 2D music box mechanism currently deviates significantly from the main page:
1. **Mislocated Horological Components**: The speed governor and butterfly fan were placed on the far-right edge ($x = 815$), whereas in authentic Sankyo 18N music boxes and on the main page, both the mainspring barrel ($x = 92, y = 88$) and governor gear train ($x = 96, y = 186$) reside on the left side, driving the cylinder from the left while the right side features a journal bearing with a ruby endstone.
2. **Thin / Needle-like Combs**: The video canvas tapered tines down to 35% width ($<7\text{px}$), producing sharp needle-like prongs rather than authentic, thick spring-steel cantilever tines ($18\text{--}26\text{px}$) with lead tuning counterweights, feather damper nibs, and a sloped comb base plate.
3. **Missing Bedplate & Rosette Details**: The video canvas omitted the circular acoustic resonance rosette, cast brass bedplate beveled gradient, and authentic drive gear meshing.

This plan establishes a unified 2D horological rendering architecture where the video recorder Canvas engine executes the exact same coordinate math, graduated tine geometry, and mechanical placement as the main page SVG view.

---

## 2. User Experience & Visual Design

### A. Video Frame Composition (720p HD / 1280 × 720)
- **Top Section ($y = 16\dots 170$)**: The cream parchment title card with traditional Chinese crimson seal stamp ("安"), song title, composer, arranged style, and live turn progress indicator.
- **Bottom Section ($y = 182\dots 704$)**: The burl-walnut cradle featuring antique brass corner brackets, horological status ribbon, and the authentic $780 \times 285$ horological movement substrate.

### B. Authentic 2D Horological Movement Geometry ($780 \times 285$)
- **Cast Brass Bedplate**: Warm brass radial gradient with beveled inner border, acoustic resonance chamber rosette at $(470, 142)$, and stamped traditional plaque ("聲 盒 仔 · 18001").
- **Top-Left Mainspring Assembly ($x = 92, y = 88$)**: Coiled blued-steel mainspring, 16-tooth ratchet wheel rotating in sync with playback, detent click pawl, and central winding arbor.
- **Lower-Left Governor & Gear Train ($x = 96, y = 186$)**:
  - Meshing intermediate nylon/bronze gear at $(96, 186)$.
  - Helical worm screw spindle with dual ruby jewel bearings at $(120, 182)$.
  - High-speed 4-blade butterfly governor fan at $(142, 180)$ spinning during playback.
  - Mechanical whip brake lever at $(142, 216)$ disengaged during playback and resting on fan when stopped.
- **Central Brass Cylinder Drum ($x = 190\dots 750$, $w = 560$, $h = 105$, $y = 36$)**:
  - Left pillow block bearing stand ($x = 162$) and bronze involute spur drive gear ($x = 174\dots 190$).
  - Rotating lathe polishing reflection lines and stamped patent mark `18001`.
  - Right axle journal bearing stand ($x = 750\dots 768$) with chrome slotted screw and ruby endstone cap.
  - Pin beads revolving in 3D orthographic projection ($R = 52.5$, strike line at $y = 133$).
- **Authentic Graded Spring-Steel Comb ($x = 190\dots 750$)**:
  - Wide rectangular cantilever beams ($tineWidth = \text{slotW} \times (0.84 - frac \times 0.26)$, $18\text{--}26\text{px}$).
  - All tine tips meet the strike line at $y = 133$.
  - Sloped comb root line ascending from $y = 230$ (low bass) to $y = 208$ (high treble).
  - Tine features: lead tuning counterweights soldered underneath bass tines, white specular bevel stripe, contact tip bevel, and feather damper nibs.
  - Brushed steel comb base plate with acoustic angled undercut ($180, 228 \to 760, 206 \to 756, 260 \to 184, 260$) secured by 3 slotted mounting screws.

---

## 3. Key Product Decisions & Trade-Offs

### Decision 1: Shared Mathematical Model & Unified Coordinate System
- **Chosen Approach**: Calibrate the canvas video renderer to project the exact $780 \times 285$ coordinate system of `MusicBoxMovement` onto the deck area ($scale = \min(deckW / 780, deckH / 285)$).
- **Why**: Eliminates layout divergence forever. Every tine width, pin position, gear center, and bearing coordinate uses the identical mathematical formulas.
- **Alternatives Considered**: Manually tweaking the old $920 \times 280$ canvas drawing (rejected because it would leave subtle misalignments and maintain two disparate layout systems).

### Decision 2: True Wide Comb Tines vs Narrowed Needles
- **Chosen Approach**: Draw full rectangular cantilever beams ($18\text{--}26\text{px}$ wide) with tip contact bevels and damper nibs, exactly like the main page SVG.
- **Why**: Real musical box combs are thick, finely ground tempered steel reeds that vibrate acoustically; thin needles look unphysical and flimsy.
- **Alternatives Considered**: Slightly widening the old trapezoids (rejected; fails the user's explicit requirement for exact 1:1 match).

### Decision 3: Preserving Static Background Cache Performance
- **Chosen Approach**: Include the static bedplate, rosette, brass plate, mounting bolts, and comb base plate in the pre-rendered static background cache canvas. Dynamic per-frame operations only draw the revolving cylinder surface, pins, vibrating tines, rotating ratchet, and spinning butterfly fan.
- **Why**: Guarantees visual perfection without compromising iPad thermal stability or causing frame drops at 24 FPS.

---

## 4. Technical Architecture & Data Strategy

```
┌────────────────────────────────────────────────────────────────────────┐
│             Shared 780 × 285 Horological Blueprint Model               │
│                                                                        │
│   (92, 88) Mainspring Barrel       (190, 36) Drum [560 × 105]  (750)   │
│   ┌──────────────────────┐         ┌────────────────────────┐  Axle    │
│   │ Coiled Spring & Pawl │         │ Revolving Pins on Lathe│  Journal │
│   └──────────────────────┘         └────────────────────────┘  Bearing │
│   (96, 186) Governor Unit          (190, 133) Strike Line              │
│   ┌──────────────────────┐         ││││││││││││││││││ Wide Tines       │
│   │ Nylon Gear & Fan     │         (180, 228) -> (760, 206) Root       │
│   └──────────────────────┘         [Sloped Comb Base Plate]            │
└────────────────────────────────────┬───────────────────────────────────┘
                                     │
           ┌─────────────────────────┴─────────────────────────┐
           ▼                                                   ▼
┌──────────────────────────────────────┐  ┌──────────────────────────────────────┐
│ Main Page View: MusicBoxMovement.tsx │  │ Video Recording Engine:              │
│ - SVG DOM Nodes                      │  │ videoRecorder.ts                     │
│ - ViewBox: 0 0 780 285               │  │ - Static BG Cache Canvas (720p)      │
│ - Interactive CSS & Hover states     │  │ - Dynamic 24 FPS Canvas Redraw       │
│ - 3D / 2D Tab Toggle                 │  │ - Exact 780×285 Coordinate Mapping   │
└──────────────────────────────────────┘  └──────────────────────────────────────┘
```

### Component & State Mapping

1. **`src/audio/videoRecorder.ts`**:
   - Update `renderStaticBackgroundAndDeck`:
     - Change coordinate viewport to $780 \times 285$ scaled to inner deck dimensions.
     - Render cast brass bedplate with radial gradient, beveled border, rosette chamber at $(470, 142)$, and 4 corner bolts.
     - Render left pillow block bearing at $(162, 54)$ and right axle journal bearing stand at $(750, 30)$ with ruby endstone.
     - Render sloped brushed steel comb base plate ($180, 228 \to 760, 206 \to 756, 260 \to 184, 260$) with 3 slotted mounting screws and engraved tuning stamp.
     - Render static governor mounting bracket and ruby bearings at $(142, 180)$.
   - Update `renderCompositeVideoFrame`:
     - Set `targetViewW = 780` and `targetViewH = 285`.
     - Relocate mainspring barrel to $(92, 88)$, drawing rotating ratchet wheel and steel click pawl.
     - Relocate speed governor and gear train to $(96, 186)$, drawing nylon gear, helical worm spindle, spinning 4-blade butterfly fan, and stop brake wire.
     - Align cylinder drum to $x = 190, y = 36, w = 560, h = 105$, left drive gear to $x = 174..190$, strike line to $y = 133$, and cylinder radius $R = 52.5$.
     - Render wide graded steel comb tines ($18\text{--}26\text{px}$) with specular bevel stripe, feather damper nibs, under-tine lead counterweights on bass tines, active pluck glow/offset, and strike sparks.
2. **`test/videoPinMapping.test.ts`**:
   - Update test assertions to verify pin coordinate mapping and tine width calculations match the $780 \times 285$ geometry.
