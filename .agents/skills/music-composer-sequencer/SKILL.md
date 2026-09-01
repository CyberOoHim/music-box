---
name: music-composer-sequencer
description: Analyzes, arranges, and transcribes musical pieces into multi-track step matrices, mechanical music box pin charts, and valid Mechanical Music Box JSON scores.
version: 1.2.0
author: Agent Skills Library
tags:
  - music-theory
  - composition
  - music-box
  - audio-synthesis
  - json-schema
---

# Music Composer & Mechanical Music Box Sequencer Skill

## 1. Overview
The **Music Composer & Mechanical Music Box Sequencer** skill enables autonomous agents to analyze harmonic progressions, transpose arrangements into authentic steel chime registers, and generate deterministic, 100% playable step-based JSON scores for mechanical music boxes, 3D cylinder simulations, and Web Audio synthesizers.

---

## 2. Target Instrument: The Mechanical Music Box

Unlike standard full-range pianos ($A_0$ to $C_8$), mechanical music boxes utilize tuned steel tines struck by brass pins on a revolving cylinder drum.

### 2.1 Supported Comb Profiles & Tine Indices

Agents MUST map notes to a specific `combScaleId` and assign an exact `tineIndex` (0 to `tinesCount - 1`) for every pin.

#### A. Deluxe Chromatic Comb (`combScaleId: "chromatic-30"`) — 30 Tines
Complete 12-tone semitone spectrum spanning 2.5 octaves ($C_5$ to $F_7$). **Mandatory for pieces with $C\sharp$ / $D\flat$ minor tonalities (e.g. Beethoven's Moonlight Sonata)** to ensure low $D\flat_5$ bass roots are playable.

| Index | Note | Freq (Hz) | Index | Note | Freq (Hz) | Index | Note | Freq (Hz) |
| :---: | :--- | :--- | :---: | :--- | :--- | :---: | :--- | :--- |
| **0** | `C5` | 523.25 | **10** | `Bb5` / `A#5` | 932.33 | **20** | `Ab6` / `G#6` | 1661.22 |
| **1** | `Db5` / `C#5` | 554.37 | **11** | `B5` | 987.77 | **21** | `A6` | 1760.00 |
| **2** | `D5` | 587.33 | **12** | `C6` | 1046.50 | **22** | `Bb6` / `A#6` | 1864.66 |
| **3** | `Eb5` / `D#5` | 622.25 | **13** | `Db6` / `C#6` | 1108.73 | **23** | `B6` | 1975.53 |
| **4** | `E5` | 659.25 | **14** | `D6` | 1174.66 | **24** | `C7` | 2093.00 |
| **5** | `F5` | 698.46 | **15** | `Eb6` / `D#6` | 1244.51 | **25** | `Db7` / `C#7` | 2217.46 |
| **6** | `Gb5` / `F#5` | 739.99 | **16** | `E6` | 1318.51 | **26** | `D7` | 2349.32 |
| **7** | `G5` | 783.99 | **17** | `F6` | 1396.91 | **27** | `Eb7` / `D#7` | 2489.02 |
| **8** | `Ab5` / `G#5` | 830.61 | **18** | `Gb6` / `F#6` | 1479.98 | **28** | `E7` | 2637.02 |
| **9** | `A5` | 880.00 | **19** | `G6` | 1567.98 | **29** | `F7` | 2793.83 |

#### B. Romantic Flat Scale Comb (`combScaleId: "romantic-flat"`) — 22 Tines
Specially engineered with dedicated flat accidental tines ($E\flat, A\flat, B\flat, D\flat, G\flat$). Default comb for Romantic masterpieces (Für Elise, Clair de Lune, Chopin Nocturnes).
- **Tines (0–21):** `0: C5`, `1: D5`, `2: Eb5`, `3: E5`, `4: F5`, `5: Gb5`, `6: G5`, `7: Ab5`, `8: A5`, `9: Bb5`, `10: B5`, `11: C6`, `12: Db6`, `13: D6`, `14: Eb6`, `15: E6`, `16: F6`, `17: Gb6`, `18: G6`, `19: Ab6`, `20: A6`, `21: Bb6`

#### C. Flat Major & Lullaby Comb (`combScaleId: "flat-major-18"`) — 18 Tines
Tuned for $E\flat$, $B\flat$, and $A\flat$ Major lullabies.
- **Tines (0–17):** `0: Bb4`, `1: C5`, `2: Db5`, `3: Eb5`, `4: F5`, `5: G5`, `6: Ab5`, `7: Bb5`, `8: C6`, `9: Db6`, `10: Eb6`, `11: F6`, `12: G6`, `13: Ab6`, `14: Bb6`, `15: C7`, `16: Db7`, `17: Eb7`

#### D. Vintage Sankyo Standard Comb (`combScaleId: "sankyo-18"`) — 18 Tines
Standard 18-note classical mechanical comb in C-Major with $F\sharp$ overtones.
- **Tines (0–17):** `0: C5`, `1: D5`, `2: E5`, `3: F5`, `4: Gb5(F#5)`, `5: G5`, `6: A5`, `7: B5`, `8: C6`, `9: D6`, `10: E6`, `11: F6`, `12: Gb6(F#6)`, `13: G6`, `14: A6`, `15: B6`, `16: C7`, `17: D7`

---

## 3. Operational Workflow & Composition Rules

### Step 1: Mode Selection
- **Mode A: Classical Masterpiece Motif Transcription (`mode: "transcription"`)**:
  - Focuses on 100% faithful reproduction of melody, authentic chord progressions, and signature rolling arpeggios as written in the original score.
  - Pin Budget: **48 to 140 pins** for rich, continuous multi-measure accompaniments.
  - Recommended Generation Temperature: `0.35` (deterministic).
- **Mode B: Creative Original Arrangement (`mode: "creative"`)**:
  - Composes new, original mechanical music box melodies and lyrical atmospheric textures.
  - Pin Budget: **24 to 56 pins**.
  - Recommended Generation Temperature: `0.80`.

### Step 2: Octave Transposition (Register Adaptation)
- **Rule:** Transpose standard piano registers up by **+2 octaves (+24 semitones)** or **+3 octaves (+36 semitones)** so the lowest bass note lands on $B\flat_4$, $C_5$, or $D\flat_5$.
- For pieces in $C\sharp$ minor / $D\flat$ minor (e.g. Moonlight Sonata), always select `chromatic-30` so $D\flat_5$ (Tine 1) is available for root bass downbeats.

### Step 3: Physical Mechanism Modeling
- **Simultaneous Polyphony Limit:** Strike at most **1 to 3 tines simultaneously** at any single step (e.g., 1 bass root note + 1–2 melody/arpeggio chimes).
- **Tine Restrike Cooldown:** When repeating the *exact same tine*, ensure a rest of **at least 2 steps** ($\ge 2$ steps) to prevent mechanical buzzing or tine jamming.
- **Loop Continuity:** The cylinder revolves continuously. Ensure step `totalSteps - 1` resolves or loops smoothly back into step `0`.

### Step 4: Grid Quantization & Triplet Division
- **Simple Duple (4/4 or 2/2 Time):** 16 steps per measure (64 steps = 4 measures; 128 steps = 8 measures).
- **Compound / Triplet Meter (e.g., Moonlight Sonata triplets):**
  - **96-Step Cylinder (8 measures of 12 steps):** Triplet eighth notes land cleanly on integer step indices:
    $\text{Beat 1: } 0, 1, 2 \mid \text{Beat 2: } 3, 4, 5 \mid \text{Beat 3: } 6, 7, 8 \mid \text{Beat 4: } 9, 10, 11$.
  - **128-Step Cylinder (8 measures of 16 steps):** Triplet eighth notes map to:
    $\text{Beat 1: } 0, 1, 2 \mid \text{Beat 2: } 4, 5, 6 \mid \text{Beat 3: } 8, 9, 10 \mid \text{Beat 4: } 12, 13, 14$.
- **Waltz (3/4 Time):** 12 steps per measure (48 steps = 4 measures; 96 steps = 8 measures).

---

## 4. Standard Output Schema

Agents MUST produce JSON compliant with the `MusicBoxSong` schema:

```json
{
  "id": "unique-song-id",
  "title": "Song Title",
  "category": "classic",
  "description": "Brief description of the melody and arrangement.",
  "tempoBpm": 68,
  "totalSteps": 128,
  "combScaleId": "chromatic-30",
  "pins": [
    { "step": 0, "tineIndex": 1, "note": "Db5" },
    { "step": 0, "tineIndex": 8, "note": "Ab5" },
    { "step": 1, "tineIndex": 13, "note": "Db6" },
    { "step": 2, "tineIndex": 16, "note": "E6" }
  ]
}
```

---

## 5. Reference Implementations

### Reference 1: Moonlight Sonata (Beethoven - C# minor on `chromatic-30`)
```json
{
  "id": "moonlight-sonata",
  "title": "Moonlight Sonata (1st Movement)",
  "category": "classic",
  "description": "Ludwig van Beethoven - Adagio sostenuto arranged for 30-note chromatic music box with rolling triplet accompaniment.",
  "tempoBpm": 68,
  "totalSteps": 128,
  "combScaleId": "chromatic-30",
  "pins": [
    { "step": 0, "tineIndex": 1, "note": "Db5" },
    { "step": 0, "tineIndex": 8, "note": "Ab5" },
    { "step": 1, "tineIndex": 13, "note": "Db6" },
    { "step": 2, "tineIndex": 16, "note": "E6" },
    { "step": 4, "tineIndex": 8, "note": "Ab5" },
    { "step": 5, "tineIndex": 13, "note": "Db6" },
    { "step": 6, "tineIndex": 16, "note": "E6" },
    { "step": 8, "tineIndex": 8, "note": "Ab5" },
    { "step": 9, "tineIndex": 13, "note": "Db6" },
    { "step": 10, "tineIndex": 16, "note": "E6" },
    { "step": 12, "tineIndex": 8, "note": "Ab5" },
    { "step": 13, "tineIndex": 13, "note": "Db6" },
    { "step": 14, "tineIndex": 16, "note": "E6" },
    { "step": 16, "tineIndex": 0, "note": "C5" },
    { "step": 16, "tineIndex": 8, "note": "Ab5" },
    { "step": 17, "tineIndex": 13, "note": "Db6" },
    { "step": 18, "tineIndex": 16, "note": "E6" },
    { "step": 20, "tineIndex": 8, "note": "Ab5" },
    { "step": 21, "tineIndex": 13, "note": "Db6" },
    { "step": 22, "tineIndex": 16, "note": "E6" },
    { "step": 24, "tineIndex": 8, "note": "Ab5" },
    { "step": 25, "tineIndex": 13, "note": "Db6" },
    { "step": 26, "tineIndex": 16, "note": "E6" },
    { "step": 28, "tineIndex": 8, "note": "Ab5" },
    { "step": 29, "tineIndex": 13, "note": "Db6" },
    { "step": 30, "tineIndex": 16, "note": "E6" },
    { "step": 32, "tineIndex": 9, "note": "A5" },
    { "step": 32, "tineIndex": 14, "note": "D6" },
    { "step": 33, "tineIndex": 17, "note": "F6" },
    { "step": 36, "tineIndex": 9, "note": "A5" },
    { "step": 37, "tineIndex": 14, "note": "D6" },
    { "step": 38, "tineIndex": 17, "note": "F6" },
    { "step": 48, "tineIndex": 8, "note": "Ab5" },
    { "step": 48, "tineIndex": 16, "note": "E6" },
    { "step": 49, "tineIndex": 20, "note": "Ab6" },
    { "step": 60, "tineIndex": 16, "note": "E6" },
    { "step": 61, "tineIndex": 20, "note": "Ab6" },
    { "step": 62, "tineIndex": 24, "note": "C7" }
  ]
}
```

### Reference 2: Für Elise (Beethoven - A minor on `romantic-flat`)
```json
{
  "id": "fur-elise",
  "title": "Für Elise (WoO 59)",
  "category": "classic",
  "description": "Ludwig van Beethoven - Bagatelle in A minor with authentic E6-Eb6 chromatic motifs and Am arpeggiation.",
  "tempoBpm": 108,
  "totalSteps": 128,
  "combScaleId": "romantic-flat",
  "pins": [
    { "step": 0, "tineIndex": 15, "note": "E6" },
    { "step": 2, "tineIndex": 14, "note": "Eb6" },
    { "step": 4, "tineIndex": 15, "note": "E6" },
    { "step": 6, "tineIndex": 14, "note": "Eb6" },
    { "step": 8, "tineIndex": 15, "note": "E6" },
    { "step": 10, "tineIndex": 10, "note": "B5" },
    { "step": 12, "tineIndex": 13, "note": "D6" },
    { "step": 14, "tineIndex": 11, "note": "C6" },
    { "step": 16, "tineIndex": 0, "note": "C5" },
    { "step": 16, "tineIndex": 8, "note": "A5" },
    { "step": 20, "tineIndex": 3, "note": "E5" },
    { "step": 24, "tineIndex": 8, "note": "A5" },
    { "step": 28, "tineIndex": 10, "note": "B5" }
  ]
}
```
