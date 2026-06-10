---
name: product-video
description: >-
  Create cinematic, narrated product-walkthrough videos end-to-end by driving the
  REAL running app with Playwright (crisp stills + element geometry), then
  compositing a "Screen Studio"-style video with @napi-rs/canvas + ffmpeg
  (browser-frame on a brand gradient, eased auto-zoom, spotlight + glow, animated
  cursor with click ripples, captions) and a real Swedish AI voiceover (ElevenLabs,
  with Gemini and offline espeak fallbacks). Use when asked to: make/record/produce
  a product or feature walkthrough video, a demo video, an SEO/marketing video, a
  narrated screen-capture, add a voiceover to a walkthrough, create a new
  per-vertical (padel/gym/tennis…) or per-feature video, or change the voice/script
  of an existing one. Lives in tools/seo-video-poc/.
license: MIT
compatibility: >-
  Requires Node.js 18+, system ffmpeg + espeak-ng, and (for recording) Playwright
  + Chromium. AI voiceover needs an ElevenLabs or Gemini API key via env
  (ELEVENLABS_API_KEY / GEMINI_API_KEY) or a gitignored key file; without one it
  falls back to offline espeak. Engine deps: @napi-rs/canvas, playwright.
metadata:
  author: william.holmberg@dotnetmentor.se
  version: "1.0"
---

# Product walkthrough videos (end-to-end)

Produce a 1080p narrated walkthrough of the real app. Two stages:

1. **`record.mjs`** — Playwright authenticates and drives the *real running app*
   through a list of "beats" (routes + interactions). Per beat it captures a
   screenshot, an optional post-interaction "reveal" shot, the focal element's
   geometry, and cursor/click targets → `out/record/timeline.json` + PNGs +
   `session.webm` (proof the real app was driven).
2. **`compose.mjs`** — reads `timeline.json`, synthesizes the Swedish voiceover
   (drives each beat's length), and renders frames with `@napi-rs/canvas`: app in
   a rounded browser-frame on a brand gradient, an eased "camera" that zooms from
   an establishing shot to the focus, spotlight dimming + glowing ring, an
   animated cursor with click ripples, and a caption lower-third. ffmpeg encodes
   each beat with its audio and stitches them with xfade/acrossfade dissolves →
   `out/walkthrough-v2.mp4`.

All code lives in `tools/seo-video-poc/`. Run node commands **from that folder**.

## Prerequisites (verify first)

- **App running locally + seeded**: API on `:5338`, web on `:5173`. The recorder
  authenticates as `admin@test.com` (OTP `111111`) against the `e2e-test` club.
- Tooling: `ffmpeg`, `espeak-ng`, Playwright + Chromium (in `backoffice-web`),
  and `@napi-rs/canvas` (already in `tools/seo-video-poc/node_modules`).
- For the members-domain demo, seed realistic data first:
  `node tools/seo-video-poc/seed-members.mjs` (a "Årsmedlemskap" base fee + ~12
  Swedish-named members, some near-expiry for the renewals beat).

## Quickstart — re-render the existing video

```bash
cd tools/seo-video-poc
node record.mjs                                   # → out/record/{*.png, timeline.json, session.webm}
TTS_PROVIDER=elevenlabs VOICES=Daniel node compose.mjs   # → out/walkthrough-v2.mp4
```

- `PREVIEW=1 node compose.mjs` dumps key frames only (fast, no encode) — use it
  to check framing/zoom before a full render.
- `VOICES=Daniel,Sarah node compose.mjs` renders the frames **once** and muxes
  each voice → `out/walkthrough-<voice>.mp4` (beat length = the longest voice, so
  all stay in sync). Single voice → `out/walkthrough-v2.mp4`.

When done, deliver the `.mp4` to the user with `SendUserFile`.

## Create a NEW video (the actual workflow)

A "video" is just a list of beats in `record.mjs`. To make a new one, edit the
beats (or copy `record.mjs` to e.g. `record-<topic>.mjs`). Each beat is:

```js
timeline.push({
  id: 'register',                       // unique slug
  kicker: 'MEDLEMSREGISTER',            // small uppercase caption label
  title: 'Alla medlemmar samlade',      // caption headline
  narration: 'Medlemsregistret …',      // Swedish VO — its length sets beat duration
  image: await shoot('01-register'),    // screenshot taken at this point
  focus: table,                         // {x,y,width,height} in 1440×900 CSS px — the zoom target
  zoom: 1.18,                           // how far the camera pushes in
  cursor: { x: VW * 0.5, y: VH * 0.5 }, // cursor rest position
  // optional: revealImage (post-interaction shot, cross-dissolved in),
  //           click / cursorTo (animate cursor to a point), 
})
```

Steps to author a beat:
1. **Navigate**: `await page.goto(\`${BASE}/t/${SLUG}/<route>\`)`, then
   `await settle()` (waits out network + the "Laddar organisation…" splash).
2. **Find the focus rect** with the geometry helpers — prefer text anchors so it
   survives DOM/layout changes; always pass a `fallback(...)` box:
   - `measureText(['Namn','Email','Andersson'])` — union of the smallest
     content-area elements containing those visible strings (robust across MUI
     Table / DataGrid / Card).
   - `measureDialog()` — the open modal/dialog paper.
   - `buttonAt(/regex/i)` / `inputCenter()` — cursor/click targets.
3. **Interactions** (typing, opening a dialog) → take a `revealImage` so the
   compositor cross-dissolves from the base shot to the result (see the search
   and add-member beats for the pattern; `openDialog(...)` handles fill + measure
   + screenshot + Escape).
4. Keep the **narration** in natural Swedish, one or two sentences per beat — it
   sets the pacing. Keep an English gloss in `TRANSCRIPT.md`.

Geometry is authored in **CSS px (1440×900 viewport)**; the compositor maps it
onto the 2880×1800 (DSF 2) screenshots and through the camera transform, so you
never deal with device pixels.

For a per-vertical series (padel/gym/tennis…), reuse the same beats but swap
routes/seed data/copy, and render one file per vertical.

## Voiceover (TTS) — `gemini-tts.mjs`

Provider-agnostic. Selected by `TTS_PROVIDER` (`elevenlabs` | `gemini` |
`espeak`), else auto: ElevenLabs key → Gemini key → espeak fallback. Returns WAV
so the rest of the pipeline is unchanged. **ElevenLabs is the best quality.**

**ElevenLabs (recommended):**
```bash
echo -n 'sk_...' > tools/seo-video-poc/.elevenlabs-key   # gitignored; or ELEVENLABS_API_KEY env
TTS_PROVIDER=elevenlabs VOICES=Daniel node compose.mjs
```
- Model: `eleven_multilingual_v2` (speaks Swedish well; voices are NOT
  language-locked — there is no "native Swedish" premade voice, the multilingual
  model handles it). Output `pcm_24000` → wrapped to WAV.
- `VOICES`/`opts.voice` accepts a **friendly name** mapped to a voice_id in
  `ELEVEN_VOICES`: `Sarah`, `Charlotte`, `Alice`, `George`, **`Daniel`** (current
  default — male, calm narrator). Pass a raw 20-char `voice_id` or set
  `ELEVEN_VOICE_ID` to use any other voice.
- Tune tone via the `voice_settings` in `elevenlabs()` (`stability`,
  `similarity_boost`, `style`, `use_speaker_boost`). Higher `stability` + speaker
  boost = more consistent across beats.
- **Free tier is blocked from this cloud env** (`detected_unusual_activity` — it
  treats datacenter IPs as a proxy). The account must be on a **paid plan**
  (Starter ~$5/mo is plenty; the whole script is ~600 chars). A 401 with that
  message = upgrade needed, not a bad key.

**Pick a voice** — generate short Swedish samples so the user can choose:
```bash
K=$(cat tools/seo-video-poc/.elevenlabs-key)
curl -s -o sample.mp3 -X POST \
  "https://api.elevenlabs.io/v1/text-to-speech/<voice_id>?output_format=mp3_44100_128" \
  -H "xi-api-key: $K" -H "Content-Type: application/json" \
  -d '{"text":"Det här är GlennBook.","model_id":"eleven_multilingual_v2"}'
```
Send the samples with `SendUserFile` and let the user pick before the full render.

**Gemini** (alt): `GEMINI_API_KEY` env or `.gemini-key` file; `VOICES=Charon`
(also Kore/Puck/Aoede). Send plain text only — a style/persona prefix makes the
timbre drift between beats.

**espeak** (offline fallback): no key needed, robotic — used automatically if a
call fails, which is what makes a voice change mid-video. Keep keys valid + on a
paid plan to avoid silent fallback.

## Output & next steps

- Master: `tools/seo-video-poc/out/walkthrough-v2.mp4` (1920×1080 @30fps).
- Embed `VideoObject` JSON-LD on the matching landing page for video SEO (pairs
  with the `seo-growth` skill).
- Real motion: composite over `session.webm` frames instead of stills, keeping
  the same camera/spotlight layer.

## File map (`tools/seo-video-poc/`)

This repo has a working instance in `tools/seo-video-poc/` that **consumes this
skill's engine** (no duplicated compositor/TTS):

| File | Role |
|------|------|
| `record.mjs` | Playwright recorder — **edit beats here** (routes, narration, focus anchors) |
| `record-onboarding.mjs` | A second recorder: the full get-started/onboarding flow |
| `compose.mjs` | **Thin wrapper** — sets `VIDEO_DIR=.` and imports the skill's `scripts/compose.mjs` |
| `seed-members.mjs` | Seeds the members-domain demo data |
| `scenes.json` + `generate.mjs` | v1 baseline (Ken Burns over static PNGs) — dependency-light fallback |
| `TRANSCRIPT.md` | Per-beat Swedish narration + English gloss |
| `README.md` | Deep-dive on how v2 works |

The compositor and TTS live **once** in `.claude/skills/product-video/scripts/`
(`compose.mjs` + `tts.mjs`). The engine reads/writes `$VIDEO_DIR/out/…`, so any
project points it at its own folder via `VIDEO_DIR` instead of copying the code.
A gitignored key file (`.elevenlabs-key`/`.gemini-key`) is found in `VIDEO_DIR`
first, then next to the engine.

## Keeping videos in sync with the app (drift detection)

Videos are committed, regenerable artifacts: each lives in `videos/<id>/` with a
manifest (`video.json`), the manus (`script.md`), and the rendered `.mp4`. The
manifest lists the **app source paths** the video covers (`sources`) and the
**commit it was last rendered at** (`lastRendered.commit`).

```bash
node check-drift.mjs          # ❌ STALE if a video's sources changed since render; exit 1
node render-video.mjs <id>    # re-record + compose + restamp lastRendered = HEAD
```

So when the onboarding flow changes, `check-drift` flags the onboarding video as
stale (with the offending commits/files), and an agent re-renders it. Good place
to wire it: CI, a SessionStart hook, or a pre-PR check. See `videos/README.md`.

## Portable bundle — copy this skill to another project

This skill folder is **self-contained**: `.claude/skills/product-video/scripts/`
ships the engine so you can drop the whole `product-video/` directory into any
project. Contents:

| File | Role |
|------|------|
| `scripts/compose.mjs` | The compositor — **project-agnostic, use as-is** (imports `./tts.mjs`) |
| `scripts/tts.mjs` | Multi-provider TTS → WAV — **project-agnostic, use as-is** |
| `scripts/package.json` | The two npm deps (`@napi-rs/canvas`, `playwright`) |
| `scripts/record.example.mjs` | Reference recorder (members domain) — **copy & adapt per project** |
| `scripts/record-onboarding.example.mjs` | Reference recorder (full onboarding flow) |

To port into a new project:
1. Copy `.claude/skills/product-video/` into the target repo.
2. `cd .claude/skills/product-video/scripts && npm install` (needs system
   `ffmpeg` + `espeak-ng` too; for AI voice, an ElevenLabs/Gemini key).
3. Copy a `record.example.mjs` to `record.mjs` and **adapt the project-specific
   bits** (everything else — camera/spotlight/cursor/captions/TTS — is generic):
   - `BASE` URL + how to **authenticate** (this project uses a dev OTP login).
   - The **beats**: routes, the on-screen **text anchors** for `measureText`, and
     the **narration** (any language — the multilingual TTS handles it).
   - Brand look: the gradient/accent colors live at the top of `compose.mjs`.
4. `node record.mjs` then `TTS_PROVIDER=elevenlabs VOICES=Daniel node compose.mjs`.

So: the **engine is copy-paste portable**; the **recorder is a per-project
template** (routes/auth/copy differ). The `tools/seo-video-poc/` instance above
is this repo's filled-in version and the richest example to crib from.

Published on the Agent Skills directory, colleagues install it with:

```bash
npx skills add <owner>/<repo> --skill product-video -a claude-code
```

It lands in their `.claude/skills/product-video/`. Then `cd scripts && npm install`
(plus system `ffmpeg`/`espeak-ng`, and an API key via env for AI voice). No
secrets are bundled — keys come from `ELEVENLABS_API_KEY`/`GEMINI_API_KEY` or a
gitignored key file (see `scripts/.env.example`).

## Troubleshooting

- **Voice changes mid-video** → a TTS call fell back to espeak. Check the key /
  paid plan and `engine=` in compose's final log; it should say your provider.
- **`admin auth failed`** → app not running/seeded, or wrong club. Needs web
  `:5173`, API `:5338`, and the `e2e-test` club.
- **Wrong/empty focus zoom** → the `measureText` anchors didn't match; update the
  visible strings or the `fallback(...)` box for that beat. Use `PREVIEW=1`.
- **Beat too fast/slow** → it's tied to narration length; shorten/lengthen the
  Swedish text (min beat length is clamped in `prepBeat`).
