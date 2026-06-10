---
name: product-video
description: >-
  Create cinematic, narrated product-walkthrough videos end-to-end by driving the
  REAL running app with Playwright (session video + element geometry; stills only
  when motion is not needed), then compositing a "Screen Studio"-style video with
  @napi-rs/canvas + ffmpeg
  (browser-frame on a brand gradient, eased auto-zoom, spotlight + glow, animated
  cursor with click ripples, captions) and AI voiceover (ElevenLabs, with Gemini
  and offline espeak fallbacks). Use when asked to: make/record/produce a product
  or feature walkthrough video, a demo video, an SEO/marketing video, a narrated
  screen-capture, add a voiceover to a walkthrough, create a new per-vertical or
  per-feature video, or change the voice/script of an existing one.
license: MIT
compatibility: >-
  Requires Node.js 18+, system ffmpeg + espeak-ng, and (for recording) Playwright
  + Chromium. AI voiceover needs an ElevenLabs or Gemini API key via env
  (ELEVENLABS_API_KEY / GEMINI_API_KEY) or a gitignored key file; without one it
  falls back to offline espeak. Engine deps: @napi-rs/canvas, playwright.
metadata:
  author: william.holmberg@dotnetmentor.se
  version: "1.1"
---

# Product walkthrough videos (end-to-end)

Produce a 1080p narrated walkthrough of the real app. Two stages:

1. **`record.mjs`** — Playwright authenticates and drives the *real running app*
   through a list of "beats" (routes + interactions). The recorder always captures
   a full **`session.webm`** of the live session (real UI motion). Per beat it
   also records focus geometry and cursor/click targets in `timeline.json`. Still
   PNGs are supporting material — use them for focus measurement and static beats,
   not as a substitute for motion when the interaction matters.
2. **`compose.mjs`** — reads `timeline.json`, synthesizes the voiceover (drives
   each beat's length), and renders frames with `@napi-rs/canvas`: app in a
   rounded browser-frame on a brand gradient, an eased "camera" that zooms from
   an establishing shot to the focus, spotlight dimming + glowing ring, an
   animated cursor with click ripples, and a caption lower-third. ffmpeg encodes
   each beat with its audio and stitches them with xfade/acrossfade dissolves →
   `out/walkthrough-v2.mp4`.

**Prefer real motion over stills.** When a beat shows typing, filtering, opening a
dialog, scrolling, or any state change, the compositor should use frames from
`session.webm` (or a per-beat clip cut from it) — not a base PNG cross-dissolved
to a `revealImage` still. Stills are fine for static overview beats (a table, a
settings page, a dashboard at rest) and for fast `PREVIEW=1` layout checks. If you
are authoring a new beat and the *action* is the point, wire motion first; fall
back to `image` + `revealImage` only when clipping the session is impractical.

Engine code lives in `scripts/` inside this skill folder. Run node commands
**from that directory** (or set `VIDEO_DIR` to a host project's working folder).

## Before you start — ask the user

1. **Narration language** — e.g. English, Swedish, German, French. Write all beat
   `narration` strings in that language. Set `TTS_LANG` for the espeak fallback
   (e.g. `en`, `sv`, `de`, `fr`).
2. **Product name & brand** (optional) — for the on-video wordmark and caption
   chip: `VIDEO_PRODUCT_NAME`, `VIDEO_BRAND_INITIAL`, and brand colors (see
   `.env.example`). Omit `VIDEO_PRODUCT_NAME` to hide the wordmark.
3. **Voice** — offer a few short TTS samples in the chosen language and let the
   user pick before a full render (see Voiceover section).

## Prerequisites (verify first)

- **App running locally** with whatever auth/seed data your `record.mjs` needs.
- Tooling: `ffmpeg`, `espeak-ng`, Playwright + Chromium, and `@napi-rs/canvas`.
  Install engine deps once: `cd scripts && npm install`.
- Copy `record.example.mjs` → `record.mjs` and adapt `BASE`, authentication,
  routes, text anchors, and narration for the target project.

## Quickstart — record + compose

```bash
cd scripts   # or: cd <your-project>/videos/<id> if VIDEO_DIR is set there
node record.mjs
TTS_PROVIDER=elevenlabs VOICES=Daniel TTS_LANG=en node compose.mjs
```

- `PREVIEW=1 node compose.mjs` dumps key frames only (fast, no encode) — use it
  to check framing/zoom before a full render.
- `VOICES=Daniel,Sarah node compose.mjs` renders the frames **once** and muxes
  each voice → `out/walkthrough-<voice>.mp4` (beat length = the longest voice, so
  all stay in sync). Single voice → `out/walkthrough-v2.mp4`.

When done, deliver the `.mp4` to the user.

## Create a NEW video (the actual workflow)

A "video" is just a list of beats in `record.mjs`. To make a new one, edit the
beats (or copy `record.mjs` to e.g. `record-<topic>.mjs`). Each beat is:

```js
timeline.push({
  id: 'dashboard',
  kicker: 'OVERVIEW',
  title: 'Everything in one place',
  narration: 'Your narration in the user\'s chosen language — length sets beat duration.',
  image: await shoot('01-dashboard'),
  focus: panel,                         // {x,y,width,height} in 1440×900 CSS px
  zoom: 1.18,
  cursor: { x: VW * 0.5, y: VH * 0.5 },  // rest position (required for cursor animation)
  cursorTo: submitBtn,                    // optional — eased move target (travel ≈1.7–2.7s)
  click: true,                            // optional — ripple + press; true = at cursorTo (or cursor)
  // optional: revealImage; or click: { x, y } for an explicit point
})
```

**Cursor / click fields** (compositor reads these from each beat):
- `cursor` — where the pointer rests before any move.
- `cursorTo` — the pointer eases here from `t≈1.7` to `t≈2.7` (`easeInOut` over 1s).
- `click` — triggers a white core pulse + white double ring with blue glow, and a brief
  cursor press. Either a `{x,y}` point in CSS px, or `true` meaning “click at `cursorTo`
  (or `cursor` if no `cursorTo`)”. With `cursorTo` set, the ripple and press fire on
  **arrival** at `t≈2.75`, not at the start of the beat. Without `cursorTo`, they fire
  around `t≈1.25`. Use `buttonAt(...)` in the recorder to measure targets; set
  `click: true` when the beat should show a button click after a cursor move.

Steps to author a beat:
1. **Navigate** to the route, then `await settle()` (wait for network + loading UI).
2. **Find the focus rect** with the geometry helpers — prefer visible text anchors
   so it survives DOM/layout changes; always pass a `fallback(...)` box:
   - `measureText(['Name', 'Email', 'Status'])` — union of elements containing
     those strings (robust across tables, grids, cards).
   - `measureDialog()` — the open modal/dialog.
   - `buttonAt(/regex/i)` / `inputCenter()` — cursor/click targets.
3. **Interactions** (typing, opening a dialog, live search) → perform them during
   the Playwright run so they land in `session.webm`. Note the beat's time range
   in `timeline.json` (or add a `clip` field) so compose can sample real motion.
   Use `revealImage` stills only as a fallback when you cannot clip the session
   cleanly.
4. Write **narration** in the user's chosen language — one or two natural
   sentences per beat; it sets the pacing. Optionally keep a translation gloss in
   `TRANSCRIPT.md`.

Geometry is authored in **CSS px (1440×900 viewport)**; the compositor maps it
onto DSF-2 screenshots and through the camera transform.

For a per-vertical or per-audience series, reuse the same beats but swap
routes/seed data/copy, and render one file per variant.

## Voiceover (TTS) — `tts.mjs`

Provider-agnostic. Selected by `TTS_PROVIDER` (`elevenlabs` | `gemini` |
`espeak`), else auto: ElevenLabs key → Gemini key → espeak fallback. Returns WAV
so the rest of the pipeline is unchanged. **ElevenLabs is the best quality.**

**ElevenLabs (recommended):**
```bash
# gitignored key file next to the engine / in VIDEO_DIR, or ELEVENLABS_API_KEY env
TTS_PROVIDER=elevenlabs VOICES=Daniel TTS_LANG=en node compose.mjs
```
- Model: `eleven_multilingual_v2` (handles many languages; voices are not
  language-locked). Output `pcm_24000` → wrapped to WAV.
- `VOICES`/`opts.voice` accepts a **friendly name** mapped to a voice_id in
  `ELEVEN_VOICES`: `Sarah`, `Charlotte`, `Alice`, `George`, `Daniel` (default).
  Pass a raw 20-char `voice_id` or set `ELEVEN_VOICE_ID` for any other voice.
- Tune tone via `voice_settings` in `elevenlabs()` (`stability`,
  `similarity_boost`, `style`, `use_speaker_boost`).
- **Free tier may be blocked from cloud/datacenter IPs** (`detected_unusual_activity`).
  A paid plan (Starter ~$5/mo is usually enough) may be required.

**Pick a voice** — generate short samples **in the user's language** so they can choose:
```bash
K="$ELEVENLABS_API_KEY"   # or: K=$(cat .elevenlabs-key)
SAMPLE_TEXT='Welcome to our product.'   # use the user's language here
curl -s -o sample.mp3 -X POST \
  "https://api.elevenlabs.io/v1/text-to-speech/<voice_id>?output_format=mp3_44100_128" \
  -H "xi-api-key: $K" -H "Content-Type: application/json" \
  -d "{\"text\":\"$SAMPLE_TEXT\",\"model_id\":\"eleven_multilingual_v2\"}"
```
Send the samples and let the user pick before the full render.

**Gemini** (alt): `GEMINI_API_KEY` env or `.gemini-key` file; `VOICES=Charon`
(also Kore/Puck/Aoede). Send plain narration text only — a style/persona prefix
makes the timbre drift between beats.

**espeak** (offline fallback): set `TTS_LANG` (e.g. `en`, `sv`). No key needed;
robotic quality — used automatically if a cloud call fails (which causes a voice
change mid-video). Keep keys valid to avoid silent fallback.

## Output & next steps

- Master: `out/walkthrough-v2.mp4` (1920×1080 @30fps).
- Raw session: `out/record/session.webm` — keep this; it is the source of truth for
  motion beats. When upgrading an existing video, replace still-based beats with
  session clips before re-rendering.
- Embed `VideoObject` JSON-LD on the matching landing page for video SEO (pairs
  with the `seo-growth` skill).

## File map (`scripts/`)

| File | Role |
|------|------|
| `compose.mjs` | Compositor — **project-agnostic** (imports `./tts.mjs`) |
| `tts.mjs` | Multi-provider TTS → WAV — **project-agnostic** |
| `package.json` | npm deps (`@napi-rs/canvas`, `playwright`) |
| `record.example.mjs` | Reference recorder — **copy & adapt per project** |
| `record-onboarding.example.mjs` | Reference onboarding-flow recorder |
| `.env.example` | Documented env vars (no secrets) |

The engine reads/writes `$VIDEO_DIR/out/…` (defaults to `scripts/`). A gitignored
key file (`.elevenlabs-key`/`.gemini-key`) is found in `VIDEO_DIR` first, then
next to the engine.

## Keeping videos in sync with the app (optional drift detection)

In projects that commit rendered videos, each can live in `videos/<id>/` with a
manifest (`video.json`), script (`script.md`), and `.mp4`. The manifest lists
**app source paths** the video covers (`sources`) and the **commit last rendered
at** (`lastRendered.commit`). Wire `check-drift.mjs` / `render-video.mjs` in CI
or pre-PR hooks if the host project provides them.

## Portable bundle — use in any project

1. Copy the `product-video/` skill folder into the target repo (or install via
   `npx skills add <owner>/<repo> --skill product-video`).
2. `cd scripts && npm install` (plus system `ffmpeg` + `espeak-ng`; API key for
   AI voice).
3. Copy `record.example.mjs` → `record.mjs` and adapt:
   - `BASE` URL + **authentication**
   - **beats**: routes, `measureText` anchors, **narration** (user's language)
   - Brand: `VIDEO_PRODUCT_NAME`, `VIDEO_BRAND_*` env vars (or defaults)
4. Ask the user for **language** and **voice**, then:
   `node record.mjs` → `TTS_PROVIDER=elevenlabs VOICES=Daniel node compose.mjs`

The **engine is portable**; the **recorder is a per-project template**.

No secrets are bundled — keys come from `ELEVENLABS_API_KEY`/`GEMINI_API_KEY` or
a gitignored key file (see `scripts/.env.example`).

## Troubleshooting

- **Voice changes mid-video** → a TTS call fell back to espeak. Check the key /
  paid plan and `engine=` in compose's final log.
- **Auth failed in recorder** → app not running/seeded, or `record.mjs` auth
  config doesn't match the environment.
- **Wrong/empty focus zoom** → `measureText` anchors didn't match; update visible
  strings or the `fallback(...)` box. Use `PREVIEW=1`.
- **Beat too fast/slow** → tied to narration length; shorten/lengthen the text
  (min beat length is clamped in `prepBeat`).
- **Click not visible** → beat needs `click` (a `{x,y}` point or `true`). With `cursorTo`,
  the ripple fires on arrival at `t≈2.75s`, so very short narrations may end the beat
  before the click — lengthen the narration or drop `cursorTo`.
