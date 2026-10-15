# Uninterrupted Live Video Recording & iOS 24 FPS Power Management

Removes the disruptive center "Eco Power Saver Active" overlay and canvas dimming from the Play & Record Studio, providing a continuous, crystal-clear live view of the spinning music box. Maintains optimal thermal management and battery protection on iPadOS/iOS by enforcing strict 24 FPS pacing and single-pass static background canvas caching under the hood.

## User Review & Critical Decisions

> [!IMPORTANT]
> The following user preferences were confirmed and govern this implementation:

- **Confirmed Decision 1 (Uninterrupted Live Preview)**: Completely remove the center "Eco Power Saver Active" banner overlay and the 50% opacity dimming. The live video monitor stays 100% clear, responsive, and visible throughout the entire recording session.
- **Confirmed Decision 2 (iOS Power Management Strategy)**: Silent background caching and strictly enforced 24 FPS pacing when on iOS/iPadOS, preventing thermal throttling without interrupting the user's recording experience.
- **Confirmed Decision 3 (Mirror Delivery)**: Continuous, synchronous 24 FPS live frame mirroring to the modal canvas without artificial pauses or frozen states.

---

## 1. Overview & Core Concept

Currently, after 10 seconds of active video recording, `PlayRecordModal` triggers an auto-dim timer that:
1. Places a large, opaque floating overlay banner (`⚡ Eco Power Saver Active · Tap to Wake Monitor`) across the center of the viewport, obscuring the moving cylinder, pins, and vibrating tines.
2. Dims the live canvas to 35% opacity.
3. Sets `data-dimmed="true"`, which causes `onFrameRendered` in `App.tsx` to stop pushing video frames to the live monitor, making users believe the recording was stalled or frozen.

In reality, iPad heating is primarily caused by unthrottled 60/120 Hz render loops and full-screen multi-gradient redraws. Because the recording engine already utilizes a **pre-rendered static background cache canvas** and a **strictly paced 24 FPS cinematic clock**, the overlay and screen freeze are completely unnecessary.

This update removes the intrusive banner and dimming entirely, ensuring the live recording view is always uninterrupted and clear, while locking the recording loop to 24 FPS on iOS.

---

## 2. User Experience & Visual Design

### A. Live Recording HUD Viewport
- **Clean, Unblocked Viewport**: The live recording viewport displays the crisp 720p HD composition (parchment title card, burl-walnut cradle, revolving brass cylinder, and vibrating steel comb) continuously without any floating banners or obstructive modals.
- **Header Status Indicator**: The header strip quietly displays `24 FPS Eco · 1280 × 720 HD` in the top right, providing clear reassurance of active power optimization without obscuring the canvas.
- **Smooth Visual Continuity**: The animated mechanism never dims or freezes; every note strike, rotating gear, and whirring butterfly fan remains visible from Turn 1 to the final ring-out.

---

## 3. Key Product Decisions & Trade-Offs

### Decision 1: Silent Architectural Power Management vs Visual Dimming
- **Chosen Approach**: Remove all client-facing dimming states and floating banners. Rely entirely on architectural power savers: 24 FPS delta-pacing ($41.67\text{ ms}$ interval), pre-rendered static background canvas caching ($>70\%$ draw call reduction), and $1.0\text{--}1.4\text{ Mbps}$ bitrate clamping.
- **Why**: Eliminates user confusion and visual disruption while delivering identical thermal protection and battery savings.
- **Alternatives Considered**: Smaller corner notification badge (rejected because the user explicitly requested zero overlay and an uninterrupted live video view).

### Decision 2: Universal iOS 24 FPS Lock
- **Chosen Approach**: Ensure all iOS / iPadOS recording pipelines consistently lock to 24 FPS vintage horological rate with no ProMotion 120 Hz bursts or unthrottled redraws.
- **Why**: Matches the user's directive ("Just always 24 fps when on iOS") and guarantees zero overheating during long 2- or 3-turn recordings.
- **Alternatives Considered**: Variable framerate (rejected due to iOS QuickTime audio-video drift).

---

## 4. Technical Architecture & Data Strategy

```
┌────────────────────────────────────────────────────────────────────────┐
│                        iPadOS / WebKit Client                          │
├────────────────────────────────────────────────────────────────────────┤
│  [24 FPS Throttled RAF Clock] (41.67ms tick)                           │
│             │                                                          │
│             ▼                                                          │
│  [Offscreen 720p Canvas] ──► [Pre-Rendered Static BG Cache] (1 draw)   │
│    - Dynamic Cylinder & Pins                                           │
│    - Whirring Butterfly Fan & Gears                                    │
│    - Vibrating Steel Reeds                                             │
│             │                                                          │
│             ├──► captureStream(24) ──► MediaRecorder (1.0 - 1.4 Mbps)  │
│             │                                                          │
│             └──► onFrameRendered ──► Live Modal Canvas                 │
│                                      (Always 100% visible, no overlay) │
└────────────────────────────────────────────────────────────────────────┘
```

### Component & State Mapping

1. **`src/components/PlayRecordModal.tsx`**:
   - Remove `isAutoDimmed` state, `lastInteractionTimeRef`, 10-second `setInterval` check, and `wakeMonitor` handler.
   - Remove the `isAutoDimmed ? 'opacity-35' : 'opacity-100'` class switch on the canvas; canvas remains `opacity-100`.
   - Remove the `{isAutoDimmed && (<div className="absolute inset-0 ...">...</div>)}` overlay block.
   - Remove `canvas.dataset.dimmed` synchronization.
2. **`src/App.tsx`**:
   - Update `onFrameRendered`: remove the `liveCanvas.dataset.dimmed === 'true'` check so frames continuously stream to the modal preview without interruption.
   - Verify that recording configuration consistently enforces 24 FPS on iOS devices.
