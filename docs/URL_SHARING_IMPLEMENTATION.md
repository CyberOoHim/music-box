# URL-Based Song Sharing Architecture & Implementation

## 1. Executive Summary & Design Principles

In Easy Composer (Taigi Numbered Notation Studio), musical scores are shared seamlessly between users via **direct, self-contained URLs** without requiring any backend server, cloud database, user accounts, or external storage services.

### Core Architectural Principles
- **Zero-Backend & Serverless**: Songs are serialized, compressed, and encoded entirely on the client side. There is zero egress cost, zero server maintenance, and no database synchronization needed.
- **Privacy-First**: The score and lyric data travel directly between the sender and receiver within the URL link. No intermediate server stores or logs personal compositions or lyrics.
- **Static Host Compatibility**: Works out of the box on static hosts (GitHub Pages, Cloudflare Pages, Cloud Run, Vercel, S3) with zero server-side routing logic required.
- **Immunity to HTTP 414/431 (URI Too Long)**: Score payloads are stored in the **URL Hash Fragment** (`#song=...`), which web browsers never transmit in HTTP request headers to web servers.
- **Lossless Round-Trip**: Supports complete Taiwanese Numbered Notation (簡譜) structures: multi-measure chords, multiple lyric orthographies (POJ, Han-lô, Hanji, Tâi-lô, custom romanizations), time signatures, key signatures, tempos, dotted notes, and ties.

---

## 2. Architecture Overview & Data Flow

```
========================= SHARING / ENCODING PIPELINE =========================
[Active Song Object in State]
             |
             v
   cleanSongForUrl()          --> Strips empty fields, default zeroes, empty lyric shells (~60% reduction)
             |
   encodeSongToUrlPayload()
        /         \
 [Is Factory Preset?]  --> YES --> Output: #preset=<preset_id>  (e.g., #preset=bang-chhun-hong)
        \ NO
         v
   compressString()           --> Native CompressionStream('deflate-raw' | 'gzip' | 'deflate')
             |
   uint8ArrayToBase64Url()    --> RFC 4648 §5 URL-safe Base64 (no +, /, or = padding)
             |
   createShareableSongUrl()   --> Formats: https://domain/path/#song=<base64url_payload>
             |
   [ShareSongModal UI]        --> Copy to clipboard, live URL size badge, length warning

======================== HYDRATION / DECODING PIPELINE ========================
[Browser opens URL with #song=... or #preset=...]
             |
             v
   extractSongParamsFromUrl() --> Reads hash (#preset= / #song= / #data=), fallback to query (?preset=)
             |
   parseSongFromUrl()
        /         \
  [Is Preset ID?]   --> YES --> Load matched factory preset from PRESET_SONGS
        \ NO
         v
   base64UrlToUint8Array()    --> Converts Base64URL string back into Uint8Array bytes
             |
   decompressBytes()          --> Native DecompressionStream with size and timeout guards (max 5 MB)
             |
   JSON.parse()               --> Deserializes JSON string to object
             |
   sanitizeSong()             --> Validates measures, pitches, chords, and assigns fallback IDs
             |
   normalizeSongDurations()   --> Guarantees rhythmic integrity and measure constraints
             |
   [app/page.tsx Lifecycle]
        * Preserves active local draft into IndexedDB
        * Loads new song into history stack
        * Displays "Opened shared score" banner with "Save to My Library"
        * Cleans URL address bar with window.history.replaceState()
```

---

## 3. Dual-Mode Sharing Strategy

The system evaluates the song to pick the most efficient URL format:

| Song Type | URL Format | Example | Typical Size |
| :--- | :--- | :--- | :--- |
| **Unmodified Factory Preset** | `#preset=<id>` | `https://domain.app/#preset=bang-chhun-hong` | < 60 characters |
| **Custom Song or Edited Preset** | `#song=<payload>` | `https://domain.app/#song=eJyVVk1v2z...` | 400 – 3,500 characters |

1. **Preset Link Detection**:
   When `createShareableSongUrl(song)` runs, it checks whether `song.id` exists in `PRESET_SONGS` and runs `isSongModifiedFromPreset(song)`:
   - If the song is identical to the built-in factory preset, it outputs an ultra-compact `#preset=<preset_id>` link.
   - If the user modified the title, notes, chords, or lyrics of a preset, it automatically switches to full `#song=<payload>` compression so all edits are preserved.

2. **Full Score Payload**:
   For any custom or modified song, the entire score structure is serialized, compressed, and encoded.

---

## 4. Detailed Compression & Encoding Pipeline (`lib/songUrl.ts`)

### Step 4.1: Structural Pruning (`cleanSongForUrl`)
Raw JSON representations of scores contain default attributes and empty strings that inflate data size. Before compression, `cleanSongForUrl` recursively strips:
- Default zero octaves (`octave: 0`)
- Falsy booleans (`isDotted: false`, `tieToNext: false`)
- Empty string attributes (`subtitle: ""`, `chord: ""`, `lyricist: ""`)
- Empty lyric objects (where `poj`, `hanlo`, `hanji`, `tl`, and `custom` are empty)
- Empty non-measure sub-arrays and empty child objects

This pre-cleaning step reduces the initial JSON string length by **45% to 70%** before compression.

### Step 4.2: Tiered Native Compression (`compressString`)
Compression runs asynchronously using the browser's native `CompressionStream` API with three prioritized formats:

1. **`deflate-raw` (Primary)**: Generates raw DEFLATE byte streams without zlib headers or Adler-32 checksum wrappers. This produces the smallest possible byte output for base64url encoding.
2. **`gzip` (Secondary Fallback)**: Standard across modern browsers (Safari 16.4+, Chrome, Firefox) if `deflate-raw` is unsupported.
3. **`deflate` (Tertiary Fallback)**: Standard zlib container format.
4. **Raw UTF-8 (Terminal Fallback)**: If `CompressionStream` is unavailable in the execution environment, falls back to uncompressed UTF-8 bytes.

**Safety Guards**:
- **500ms Timeout (`withTimeout`)**: Prevents stream lockups or main-thread stalls on resource-constrained mobile devices.
- **Maximum Output Cap**: Limits compressed output to 2 MB (`MAX_COMPRESSED_BYTES`) to prevent denial-of-service memory allocations.

### Step 4.3: URL-Safe Base64URL Encoding (`uint8ArrayToBase64Url`)
Standard Base64 contains characters (`+`, `/`, `=`) that require percent-encoding in URLs. The engine implements RFC 4648 §5 Base64URL encoding:
- `+` is replaced with `-`
- `/` is replaced with `_`
- Trailing padding `=` signs are stripped
- **Cross-Platform Compatibility**: Uses native browser `btoa` directly, deliberately avoiding browser `Buffer` polyfill quirks (e.g., throwing `TypeError: Unknown encoding: base64url`). In Node.js server environments, it uses `Buffer.from(bytes).toString('base64')` with string replacement.

---

## 5. Decompression & Hydration Pipeline

When a user receives and opens a shared link:

### Step 5.1: URL Parameter Extraction (`extractSongParamsFromUrl`)
The function extracts parameters by prioritizing:
1. **Hash Fragment** (`#preset=`, `#song=`, `#data=`)
2. **Search Query Parameter** (`?preset=`, `?song=`, `?data=`) as a fallback for messaging apps or email clients that strip URL hashes.

### Step 5.2: Safe Decompression (`decodeSongFromUrlPayload`)
1. **Payload Guard**: Validates that the payload string does not exceed 300,000 characters (`MAX_URL_PAYLOAD_CHARS`).
2. **Base64URL Decoding**: `base64UrlToUint8Array` reconstructs standard base64 padding (`=`) and converts back into raw bytes using `atob`.
3. **Decompression**: `decompressBytes` pipes the bytes through `DecompressionStream('deflate-raw')`, with automatic fallbacks to `gzip`, `deflate`, and plain UTF-8 text decoding.
4. **Zip-Bomb & Memory Explosion Guard**: The stream reader monitors total decompressed length and immediately terminates (`reader.cancel()`) if output exceeds 5 MB (`MAX_DECOMPRESSED_BYTES`).
5. **JSON Parsing & Fallback**: Parses decompressed text with `JSON.parse`. If parsing fails, attempts URL component decoding in case the string was passed with percent-encoding.
6. **Sanitization & Normalization**:
   - `sanitizeSong()` validates the presence of title, measures, and note structures.
   - `normalizeSongDurations()` validates and recalculates note duration ticks.

---

## 6. Application Lifecycle Integration (`app/page.tsx`)

### 6.1 App Bootstrap
During initial component mount in `app/page.tsx`:
1. IndexedDB is initialized, and existing local drafts are verified.
2. `parseSongFromUrl(window.location)` checks whether the page was launched via a shared link.
3. **Local Draft Safety**: If the user had an unsaved local draft in progress, it is automatically persisted to IndexedDB before loading the shared score, preventing accidental loss of previous work.
4. The shared song is loaded via `loadNewSong(sharedSong, { unsaved: !isPreset })`.
5. A notification banner (`sharedSongNotice`) is displayed at the top of the interface.
6. **Address Bar Clean-Up**:
   ```typescript
   if (typeof window !== 'undefined' && window.history?.replaceState) {
     const u = new URL(window.location.href);
     u.hash = '';
     u.searchParams.delete('song');
     u.searchParams.delete('preset');
     u.searchParams.delete('data');
     window.history.replaceState(null, '', u.pathname + (u.search || ''));
   }
   ```
   This clears the long hash from the address bar after loading so that subsequent manual page refreshes or bookmarks don't perpetually re-load the historical snapshot over current edits.

### 6.2 In-Page Hash Change Listener
The app registers a `window.addEventListener('hashchange')` listener:
- If a user clicks another shared link or pastes a new `#song=...` URL while the application is already running, the active score is auto-saved to IndexedDB, and the new score loads dynamically without requiring a full page reload.

### 6.3 Shared Score Banner & Action Options
When loaded from a URL, a prominent banner appears above the score:
- Displays song title, key signature (`1=C`), time signature (`4/4`), tempo (`BPM`), and measure count.
- **Save to My Library**: Explicit button that saves the shared score into the user's permanent local IndexedDB custom library.
- **Share**: Opens the share modal to re-share or generate a fresh link.
- **Dismiss**: Closes the notification banner.

---

## 7. User Interface (`components/ShareSongModal.tsx`)

The Share Song Modal provides a clear, user-friendly experience:
- **Asynchronous Generation with Memoization**: The modal calculates the compressed URL on open and reuses the cached result if the song object has not changed, avoiding redundant CPU cycles.
- **Payload Size & Status Badges**:
  - Unmodified presets show a purple `Preset Link` badge.
  - Custom scores show a green `Compressed (X.X KB)` badge indicating the payload size.
- **Large URL Warning**:
  - If a compressed payload exceeds 4 KB (`> 4096 bytes`), an alert informs the user that some chat platforms (e.g., Line, WeChat, SMS) may truncate links over 4 KB, recommending direct copy-paste or email for ultra-long compositions.
- **Multi-Tier Clipboard Copying**:
  - Attempts the modern asynchronous Clipboard API (`navigator.clipboard.writeText`).
  - Gracefully falls back to a hidden `<textarea>` with `document.execCommand('copy')` to support iOS/iPadOS Safari WebKit and sandboxed iframe environments.
- **"Test Link" Button**:
  - Allows the composer to open the generated link in a new browser tab (`window.open(url, '_blank')`) to verify that the recipient will see the exact intended score.

---

## 8. Test Coverage & Verification

The URL sharing engine is covered by automated unit tests in `test/songUrl.test.ts`:
- Base64URL encoding/decoding consistency with RFC 4648 §5.
- Lossless compression and decompression round-tripping.
- Preset ID generation for factory presets vs. full compressed URL generation for edited presets.
- Multi-measure, multi-verse custom song round-tripping.
- Hash vs. search query parameter extraction order.
- Rejection and error messages on corrupt or truncated payloads.
- Safety and performance on large payloads (50 KB+ raw text).
- Browser-like environments without Node.js `Buffer` globals.
- Simulation of faulty `Buffer` polyfills that lack `base64url` support.
