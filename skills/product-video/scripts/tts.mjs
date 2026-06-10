// ---------------------------------------------------------------------------
// Multi-provider Swedish voiceover → WAV (the rest of the pipeline is unchanged).
//
// Providers (pick via TTS_PROVIDER, else auto by available key):
//   • elevenlabs — most natural/consistent (eleven_multilingual_v2). pcm_24000.
//   • gemini     — Google Gemini TTS (prebuilt voices). PCM base64.
//   • espeak     — offline fallback (espeak-ng -v sv) when no key / on error.
//
// Keys (never committed — gitignored files or env):
//   ELEVENLABS_API_KEY / .elevenlabs-key   GEMINI_API_KEY / .gemini-key
// Voice override: opts.voice, or ELEVEN_VOICE_ID (ElevenLabs) / TTS_VOICE (Gemini).
// ---------------------------------------------------------------------------
import { execFileSync } from 'node:child_process'
import { writeFileSync, readFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))

// Look for a gitignored key file in the host project (VIDEO_DIR) first, then
// next to the engine — so a project keeps its own key without copying it here.
const keyFile = (name) => {
  for (const dir of [process.env.VIDEO_DIR, HERE].filter(Boolean)) {
    const f = join(dir, name)
    if (existsSync(f)) return readFileSync(f, 'utf8').trim()
  }
  return null
}
const geminiKey = () => (process.env.GEMINI_API_KEY || keyFile('.gemini-key') || '').trim() || null
const elevenKey = () => (process.env.ELEVENLABS_API_KEY || keyFile('.elevenlabs-key') || '').trim() || null

// which engine to use: explicit override, else best available key, else espeak
function provider() {
  const p = (process.env.TTS_PROVIDER || '').toLowerCase()
  if (p) return p
  if (elevenKey()) return 'elevenlabs'
  if (geminiKey()) return 'gemini'
  return 'espeak'
}

function pcmToWav(pcm, sampleRate = 24000, channels = 1, bits = 16) {
  const blockAlign = (channels * bits) / 8
  const byteRate = sampleRate * blockAlign
  const h = Buffer.alloc(44)
  h.write('RIFF', 0)
  h.writeUInt32LE(36 + pcm.length, 4)
  h.write('WAVE', 8)
  h.write('fmt ', 12)
  h.writeUInt32LE(16, 16)
  h.writeUInt16LE(1, 20) // PCM
  h.writeUInt16LE(channels, 22)
  h.writeUInt32LE(sampleRate, 24)
  h.writeUInt32LE(byteRate, 28)
  h.writeUInt16LE(blockAlign, 32)
  h.writeUInt16LE(bits, 34)
  h.write('data', 36)
  h.writeUInt32LE(pcm.length, 40)
  return Buffer.concat([h, pcm])
}

function espeak(text, outPath) {
  execFileSync('espeak-ng', ['-v', 'sv', '-s', '150', '-p', '42', '-w', outPath, text])
}

// Throttle + retry so the free-tier TTS rate limit (HTTP 429) never silently
// drops a segment to espeak — which is what made the voice change mid-video.
let lastCall = 0
const MIN_GAP_MS = 6000
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function gemini(text, outPath, key, { voice = 'Charon', model = 'gemini-2.5-flash-preview-tts' } = {}) {
  // IMPORTANT: send the plain text. A style/persona instruction prefix
  // ("read this warmly…") makes the model re-interpret the speaker per call,
  // so the timbre drifts between beats. The prebuilt `voiceName` alone keeps
  // one consistent voice across every segment. (Swedish is auto-detected.)
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`
  const body = JSON.stringify({
    contents: [{ parts: [{ text }] }],
    generationConfig: {
      responseModalities: ['AUDIO'],
      speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } },
    },
  })
  const maxRetries = 6
  for (let attempt = 0; ; attempt++) {
    // space calls out to stay under the per-minute quota
    const wait = Math.max(0, MIN_GAP_MS - (Date.now() - lastCall))
    if (wait) await sleep(wait)
    lastCall = Date.now()

    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body })
    if (res.ok) {
      const json = await res.json()
      const part = json.candidates?.[0]?.content?.parts?.find((p) => p.inlineData)
      if (!part) throw new Error('Gemini TTS: no audio in response')
      const rate = parseInt((part.inlineData.mimeType.match(/rate=(\d+)/) || [])[1] || '24000', 10)
      writeFileSync(outPath, pcmToWav(Buffer.from(part.inlineData.data, 'base64'), rate))
      return
    }
    const txt = await res.text().catch(() => '')
    if ((res.status === 429 || res.status === 503) && attempt < maxRetries) {
      let backoff = [12, 20, 30, 45, 60, 75][attempt] ?? 60
      const m = txt.match(/"retryDelay":\s*"(\d+(?:\.\d+)?)s"/)
      if (m) backoff = Math.max(backoff, Math.ceil(parseFloat(m[1])) + 2)
      console.warn(`  Gemini ${res.status} (rate limit) — retry ${attempt + 1}/${maxRetries} in ${backoff}s`)
      await sleep(backoff * 1000)
      continue
    }
    throw new Error(`Gemini TTS HTTP ${res.status}: ${txt.slice(0, 160)}`)
  }
}

// ElevenLabs — most natural / consistent. Returns raw PCM (pcm_24000) which we
// wrap as WAV. voice = an ElevenLabs voice_id (override per render via opts.voice
// or ELEVEN_VOICE_ID). model defaults to the multilingual model (good Swedish).
// friendly name → premade voice_id (multilingual, work well for Swedish)
const ELEVEN_VOICES = {
  sarah: 'EXAVITQu4vr4xnSDxMaL',
  charlotte: 'XB0fDUnXU5powFXDhCwa',
  alice: 'Xb7hH8MSUJpSbSDYk0k2',
  george: 'JBFqnCBsd6RMkjVDRZzb',
  daniel: 'onwK4e9ZLuTAKqWW03F9',
}
function resolveElevenVoice(voice) {
  const v = (voice || '').trim()
  if (ELEVEN_VOICES[v.toLowerCase()]) return ELEVEN_VOICES[v.toLowerCase()]
  if (/^[A-Za-z0-9]{20}$/.test(v)) return v // already a voice_id
  return process.env.ELEVEN_VOICE_ID || 'onwK4e9ZLuTAKqWW03F9' // default: Daniel
}

async function elevenlabs(text, outPath, { voice } = {}) {
  const key = elevenKey()
  const voiceId = resolveElevenVoice(voice)
  const model = process.env.ELEVEN_MODEL || 'eleven_multilingual_v2'
  const url = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=pcm_24000`
  const body = JSON.stringify({
    text,
    model_id: model,
    // higher stability + speaker boost keeps one consistent voice across beats
    voice_settings: { stability: 0.5, similarity_boost: 0.8, style: 0.0, use_speaker_boost: true },
  })
  for (let attempt = 0; ; attempt++) {
    const wait = Math.max(0, 1500 - (Date.now() - lastCall))
    if (wait) await sleep(wait)
    lastCall = Date.now()
    const res = await fetch(url, { method: 'POST', headers: { 'xi-api-key': key, 'Content-Type': 'application/json' }, body })
    if (res.ok) {
      writeFileSync(outPath, pcmToWav(Buffer.from(await res.arrayBuffer()), 24000))
      return
    }
    const txt = await res.text().catch(() => '')
    if ((res.status === 429 || res.status >= 500) && attempt < 5) {
      const w = [8, 15, 25, 40, 60][attempt] ?? 60
      console.warn(`  ElevenLabs ${res.status} — retry ${attempt + 1}/5 in ${w}s`)
      await sleep(w * 1000)
      continue
    }
    throw new Error(`ElevenLabs HTTP ${res.status}: ${txt.slice(0, 200)}`)
  }
}

/** Synthesize `text` to a WAV at `outPath`. Returns the engine used. */
export async function synthVoice(text, outPath, opts = {}) {
  const p = provider()
  try {
    if (p === 'elevenlabs') { await elevenlabs(text, outPath, opts); return 'elevenlabs' }
    if (p === 'gemini') { await gemini(text, outPath, geminiKey(), opts); return 'gemini' }
  } catch (e) {
    console.warn(`  ⚠ ${e.message} — falling back to espeak`)
  }
  espeak(text, outPath)
  return 'espeak'
}

export const ttsEngine = () => provider()
