// ---------------------------------------------------------------------------
// v2 cinematic compositor — "Screen Studio"-style.
//
// Reads out/record/timeline.json + screenshots and renders, per beat, a
// camera move with eased auto-zoom toward the measured focus element, the app
// framed in a browser window floating on a gradient with a soft shadow, a
// spotlight that dims everything but the focus, an animated cursor with click
// ripples, a caption lower-third, and (for the members beat) a live search
// reveal dissolve. Beats are encoded with their espeak narration, then stitched
// with cross-dissolves (ffmpeg xfade + acrossfade).
//
// Output: out/walkthrough-v2.mp4
// ---------------------------------------------------------------------------
import { createCanvas, loadImage, GlobalFonts } from '@napi-rs/canvas'
import { synthVoice, ttsEngine } from './tts.mjs'
import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
// Working dir: defaults to the engine's own folder, but a host project can point
// the engine at its own out/record via VIDEO_DIR (so this stays the single copy).
const ROOT = process.env.VIDEO_DIR ? resolve(process.env.VIDEO_DIR) : HERE
const REC = join(ROOT, 'out', 'record')
const WORK = join(ROOT, 'out', 'work')
const OUT = join(ROOT, 'out', 'walkthrough-v2.mp4')
rmSync(WORK, { recursive: true, force: true })
mkdirSync(WORK, { recursive: true })

GlobalFonts.registerFromPath('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 'UISans')
GlobalFonts.registerFromPath('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 'UISansRegular')

const meta = JSON.parse(readFileSync(join(REC, 'timeline.json'), 'utf8'))
const VW = meta.viewport.w
const VH = meta.viewport.h

// One or more Gemini voices. Frames are rendered ONCE; each voice is muxed onto
// them (beat length = max narration duration across voices, so all fit).
const VOICES = (process.env.VOICES || process.env.TTS_VOICE || 'Charon')
  .split(',').map((s) => s.trim()).filter(Boolean)

// --- output / layout constants ---------------------------------------------
const CW = 1920
const CH = 1080
const FPS = 30
const MARGIN = 64
const TB = 0 // no browser chrome bar — just the framed screen
const RAD = 18 // window corner radius
const CENTER = { x: CW / 2, y: CH / 2 }
const BRAND = '#007AFF' // GlennBook primary
const BRAND2 = '#5856D6' // GlennBook secondary (indigo)
const BRAND_LIGHT = '#5aa9ff'

// window placement at establishing (camera identity)
const availW = CW - 2 * MARGIN
const availH = CH - 2 * MARGIN - TB
const ssRatio = (VW) / (VH) // screenshot aspect (css px ratio == device ratio)
const WW = Math.min(availW, availH * ssRatio)
const WH = WW / ssRatio
const WIN = { x: (CW - WW) / 2, y: (CH - (WH + TB)) / 2, w: WW, h: WH }
const shot = { x: WIN.x, y: WIN.y + TB, w: WW, h: WH }
const S0 = shot.w / VW // canvas px per css px when the screenshot fits the viewport
const SHOTC = { x: shot.x + shot.w / 2, y: shot.y + shot.h / 2 }
// the screen viewport path — all four corners rounded (no chrome bar)
const screenPath = (ctx) => roundRect(ctx, shot.x, shot.y, shot.w, shot.h, RAD)

// css-px point -> establishing canvas point
const cssToEst = (cx, cy) => ({ x: shot.x + (cx / VW) * shot.w, y: shot.y + (cy / VH) * shot.h })
const rectToEst = (r) => {
  const a = cssToEst(r.x, r.y)
  return { x: a.x, y: a.y, w: (r.width / VW) * shot.w, h: (r.height / VH) * shot.h }
}

// --- easing -----------------------------------------------------------------
const clamp01 = (t) => Math.max(0, Math.min(1, t))
const easeInOut = (t) => { t = clamp01(t); return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2 }
const easeOut = (t) => { t = clamp01(t); return 1 - Math.pow(1 - t, 3) }
const smooth = (a, b, t) => { const u = clamp01((t - a) / (b - a)); return u * u * (3 - 2 * u) }
const lerp = (a, b, t) => a + (b - a) * t

const sh = (cmd, args) => execFileSync(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] })
const probeDur = (f) =>
  parseFloat(sh('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]).toString().trim())

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, r)
}

// pre-rendered gradient background (with glow + vignette)
function makeBackground() {
  const c = createCanvas(CW, CH)
  const x = c.getContext('2d')
  // GlennBook brand gradient: deep navy → indigo
  const g = x.createLinearGradient(0, 0, CW, CH)
  g.addColorStop(0, '#0b1834')
  g.addColorStop(0.55, '#101633')
  g.addColorStop(1, '#0a0e1f')
  x.fillStyle = g
  x.fillRect(0, 0, CW, CH)
  // brand-blue glow (upper) + indigo glow (lower-right)
  const rg = x.createRadialGradient(CW * 0.5, CH * 0.14, 80, CW * 0.5, CH * 0.14, CW * 0.72)
  rg.addColorStop(0, 'rgba(0,122,255,0.30)')
  rg.addColorStop(1, 'rgba(0,122,255,0)')
  x.fillStyle = rg
  x.fillRect(0, 0, CW, CH)
  const ig = x.createRadialGradient(CW * 0.82, CH * 0.92, 60, CW * 0.82, CH * 0.92, CW * 0.55)
  ig.addColorStop(0, 'rgba(88,86,214,0.22)')
  ig.addColorStop(1, 'rgba(88,86,214,0)')
  x.fillStyle = ig
  x.fillRect(0, 0, CW, CH)
  // vignette
  const vg = x.createRadialGradient(CENTER.x, CENTER.y, CH * 0.35, CENTER.x, CENTER.y, CH * 0.85)
  vg.addColorStop(0, 'rgba(0,0,0,0)')
  vg.addColorStop(1, 'rgba(0,0,0,0.45)')
  x.fillStyle = vg
  x.fillRect(0, 0, CW, CH)
  return c
}
const BG = makeBackground()

function drawCursor(ctx, x, y, press) {
  const s = 22 * (press ? 0.86 : 1)
  ctx.save()
  ctx.translate(x, y)
  ctx.shadowColor = 'rgba(0,0,0,0.45)'
  ctx.shadowBlur = 10
  ctx.shadowOffsetY = 3
  // classic arrow pointer
  ctx.beginPath()
  ctx.moveTo(0, 0)
  ctx.lineTo(0, s * 1.25)
  ctx.lineTo(s * 0.30, s * 0.95)
  ctx.lineTo(s * 0.52, s * 1.45)
  ctx.lineTo(s * 0.70, s * 1.36)
  ctx.lineTo(s * 0.48, s * 0.86)
  ctx.lineTo(s * 0.86, s * 0.86)
  ctx.closePath()
  ctx.fillStyle = '#fff'
  ctx.fill()
  ctx.lineWidth = 1.6
  ctx.strokeStyle = 'rgba(20,24,40,0.9)'
  ctx.shadowColor = 'transparent'
  ctx.stroke()
  ctx.restore()
}

// --- prepare a beat: load assets, return a drawFrame(t) closure -------------
async function prepBeat(beat, idx, voices = VOICES) {
  const dir = join(WORK, `beat${idx}`)
  mkdirSync(dir, { recursive: true })
  const wavs = {}
  let maxDur = 0
  for (const voice of voices) {
    const w = join(dir, `voice-${voice}.wav`)
    await synthVoice(beat.narration, w, { voice })
    wavs[voice] = w
    maxDur = Math.max(maxDur, probeDur(w))
  }
  const L = Math.max(4.2, maxDur + 0.9) // lead 0.2 + tail 0.7; fits the longest voice

  const baseImg = await loadImage(join(REC, beat.image))
  const revealImg = beat.revealImage ? await loadImage(join(REC, beat.revealImage)) : null

  // focus centre in CSS px (the screenshot, not the canvas) — the zoom happens
  // INSIDE the fixed window, so the pivot lives in screenshot space.
  const C1 = { x: beat.focus.x + beat.focus.width / 2, y: beat.focus.y + beat.focus.height / 2 }

  const canvas = createCanvas(CW, CH)
  const ctx = canvas.getContext('2d')

  const drawFrame = (t) => {
    // camera — operates on the screenshot CONTENT inside the fixed window
    const u = easeInOut((t - 0.15) / 1.15)
    const drift = 1 + 0.03 * easeOut(t / L)
    const Z = lerp(1, beat.zoom, u) * drift
    const Cp = { x: lerp(VW / 2, C1.x, u), y: lerp(VH / 2, C1.y, u) } // css pivot
    const eff = Z * S0 // canvas px per css px
    // place the screenshot so the pivot maps to the viewport centre, then CLAMP
    // so the (zoomed) screenshot always fully covers the screen — no white gaps
    // when the focus is near an edge.
    const dx = Math.min(shot.x, Math.max(shot.x + shot.w - VW * eff, SHOTC.x - eff * Cp.x))
    const dy = Math.min(shot.y, Math.max(shot.y + shot.h - VH * eff, SHOTC.y - eff * Cp.y))
    const mapPt = (cx, cy) => ({ x: dx + eff * cx, y: dy + eff * cy })

    ctx.clearRect(0, 0, CW, CH)
    ctx.drawImage(BG, 0, 0)

    // ---- fixed window frame (never moves; consistent padding to edges) ----
    ctx.save()
    ctx.shadowColor = 'rgba(0,0,0,0.30)'
    ctx.shadowBlur = 90
    ctx.shadowOffsetY = 34
    ctx.fillStyle = '#ffffff'
    roundRect(ctx, WIN.x, WIN.y, WIN.w, WIN.h + TB, RAD)
    ctx.fill()
    ctx.restore()

    // ---- the screen: zoom/pan the screenshot, CLIPPED to the fixed viewport
    ctx.save()
    screenPath(ctx)
    ctx.clip()
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(shot.x, shot.y, shot.w, shot.h)
    ctx.drawImage(baseImg, dx, dy, VW * eff, VH * eff)
    if (revealImg) {
      const a = smooth(1.5, 1.95, t)
      if (a > 0) {
        ctx.globalAlpha = a
        ctx.drawImage(revealImg, dx, dy, VW * eff, VH * eff)
        ctx.globalAlpha = 1
      }
    }
    // cursor + click ripple (also clipped to the screen)
    if (beat.cursor) {
      let cur = beat.cursor
      if (beat.cursorTo) {
        const mv = easeInOut((t - 1.7) / 1.0)
        cur = { x: lerp(beat.cursor.x, beat.cursorTo.x, mv), y: lerp(beat.cursor.y, beat.cursorTo.y, mv) }
      }
      const p = mapPt(cur.x, cur.y)
      if (beat.click) {
        const cr = smooth(1.15, 1.7, t)
        if (cr > 0 && cr < 1) {
          const cp = mapPt(beat.click.x, beat.click.y)
          ctx.save()
          ctx.globalAlpha = (1 - cr) * 0.6
          ctx.strokeStyle = BRAND
          ctx.lineWidth = 3
          ctx.beginPath()
          ctx.arc(cp.x, cp.y, 8 + cr * 34, 0, Math.PI * 2)
          ctx.stroke()
          ctx.restore()
        }
      }
      const press = beat.click ? t > 1.15 && t < 1.4 : false
      drawCursor(ctx, p.x, p.y, press)
    }
    ctx.restore()

    // window border (fixed)
    ctx.save()
    ctx.lineWidth = 1.2
    ctx.strokeStyle = 'rgba(255,255,255,0.12)'
    roundRect(ctx, WIN.x, WIN.y, WIN.w, WIN.h + TB, RAD)
    ctx.stroke()
    ctx.restore()

    // ---- caption badge: eyebrow kicker + title ----
    {
      const inA = smooth(0.15, 0.62, t)
      const outA = 1 - smooth(L - 0.6, L - 0.12, t)
      const a = Math.min(inA, outA)
      if (a > 0.001) {
        const setLS = (v) => { if ('letterSpacing' in ctx) ctx.letterSpacing = v }
        ctx.save()
        ctx.globalAlpha = a
        const slide = (1 - easeOut(inA)) * 26
        const bx = 72
        const padR = 36
        const kicker = (beat.kicker || '').toUpperCase()
        // measure
        ctx.font = '700 38px UISans'
        const titleW = ctx.measureText(beat.title).width
        ctx.font = '700 15px UISans'
        setLS('3px')
        const kickW = kicker ? ctx.measureText(kicker).width : 0
        setLS('0px')
        const bh = kicker ? 100 : 78
        const CHIP = bh - 34
        const chipX = bx + 18
        const tx = chipX + CHIP + 22 // text starts after the brand chip
        const bw = (tx - bx) + Math.max(titleW, kickW) + padR
        const by = CH - 60 - bh + slide

        // gradient pill + soft shadow
        ctx.shadowColor = 'rgba(0,0,0,0.42)'
        ctx.shadowBlur = 30
        ctx.shadowOffsetY = 14
        const g = ctx.createLinearGradient(bx, by, bx, by + bh)
        g.addColorStop(0, '#16213c')
        g.addColorStop(1, '#0c1322')
        ctx.fillStyle = g
        roundRect(ctx, bx, by, bw, bh, 22)
        ctx.fill()
        ctx.shadowColor = 'transparent'
        // glassy top highlight
        ctx.lineWidth = 1
        ctx.strokeStyle = 'rgba(255,255,255,0.10)'
        roundRect(ctx, bx + 0.5, by + 0.5, bw - 1, bh - 1, 22)
        ctx.stroke()

        // GlennBook brand "G" chip (animated scale-in)
        const cs = 0.6 + 0.4 * easeOut(inA)
        const chipY = by + (bh - CHIP) / 2
        ctx.save()
        ctx.translate(chipX + CHIP / 2, chipY + CHIP / 2)
        ctx.scale(cs, cs)
        ctx.translate(-(chipX + CHIP / 2), -(chipY + CHIP / 2))
        const cg = ctx.createLinearGradient(chipX, chipY, chipX + CHIP, chipY + CHIP)
        cg.addColorStop(0, BRAND)
        cg.addColorStop(1, BRAND2)
        ctx.shadowColor = 'rgba(0,122,255,0.45)'
        ctx.shadowBlur = 16
        ctx.shadowOffsetY = 4
        ctx.fillStyle = cg
        roundRect(ctx, chipX, chipY, CHIP, CHIP, 15)
        ctx.fill()
        ctx.shadowColor = 'transparent'
        ctx.fillStyle = '#ffffff'
        ctx.font = `700 ${Math.round(CHIP * 0.62)}px UISans`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText('G', chipX + CHIP / 2, chipY + CHIP / 2 + 1)
        ctx.restore()

        // text
        ctx.textAlign = 'left'
        if (kicker) {
          ctx.textBaseline = 'alphabetic'
          ctx.font = '700 15px UISans'
          setLS('3px')
          ctx.fillStyle = BRAND_LIGHT
          ctx.fillText(kicker, tx, by + 40)
          setLS('0px')
          ctx.font = '700 38px UISans'
          ctx.fillStyle = '#ffffff'
          ctx.fillText(beat.title, tx, by + 80)
        } else {
          ctx.textBaseline = 'middle'
          ctx.font = '700 38px UISans'
          ctx.fillStyle = '#ffffff'
          ctx.fillText(beat.title, tx, by + bh / 2)
        }
        ctx.restore()
      }
    }

    // ---- GlennBook wordmark (top-right brand signature) ----
    {
      ctx.save()
      ctx.globalAlpha = 0.9
      const wy = 50
      ctx.textBaseline = 'middle'
      ctx.textAlign = 'right'
      ctx.font = '700 26px UISans'
      const wx = CW - 56
      ctx.fillStyle = '#ffffff'
      ctx.textBaseline = 'middle'
      ctx.fillText('GlennBook', wx, wy)
      // brand dot before the wordmark
      const tw = ctx.measureText('GlennBook').width
      const dg = ctx.createLinearGradient(wx - tw - 26, wy - 8, wx - tw - 10, wy + 8)
      dg.addColorStop(0, BRAND)
      dg.addColorStop(1, BRAND2)
      ctx.fillStyle = dg
      ctx.beginPath()
      ctx.arc(wx - tw - 18, wy, 8, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()
    }

    return canvas.toBuffer('image/png')
  }

  return { drawFrame, L, dir, wavs, idx, id: beat.id }
}

const T = 0.45 // crossfade duration (s)

// render a prepped beat's frames ONCE (shared across voices)
function renderFrames(b) {
  const frames = Math.round(b.L * FPS)
  for (let f = 0; f < frames; f++) {
    writeFileSync(join(b.dir, `f${String(f).padStart(5, '0')}.png`), b.drawFrame(f / FPS))
  }
}

// mux one voice's narration onto a beat's frames → a clip. apad+(-t) keeps
// audio and video exactly equal so the crossfades line up.
function encodeClip(b, voice) {
  const clip = join(b.dir, `clip-${voice}.mp4`)
  sh('ffmpeg', [
    '-y', '-framerate', String(FPS), '-i', join(b.dir, 'f%05d.png'),
    '-i', b.wavs[voice],
    '-af', 'apad', '-t', String(b.L),
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-r', String(FPS),
    '-c:a', 'aac', '-b:a', '160k',
    clip,
  ])
  return { clip, L: probeDur(clip) }
}

function stitch(clips, outPath) {
  const inputs = clips.flatMap((c) => ['-i', c.clip])
  let vf = '', af = '', vl = '0:v', al = '0:a', acc = clips[0].L
  for (let i = 1; i < clips.length; i++) {
    const off = acc - T, vo = `v${i}`, ao = `a${i}`
    vf += `[${vl}][${i}:v]xfade=transition=fade:duration=${T}:offset=${off.toFixed(3)}[${vo}];`
    af += `[${al}][${i}:a]acrossfade=d=${T}[${ao}];`
    vl = vo; al = ao; acc = acc + clips[i].L - T
  }
  const filter = (vf + af).replace(/;$/, '')
  sh('ffmpeg', [
    '-y', ...inputs, '-filter_complex', filter,
    '-map', `[${vl}]`, '-map', `[${al}]`,
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '160k',
    '-movflags', '+faststart', outPath,
  ])
}

// --- PREVIEW mode: dump key frames per beat, no encoding --------------------
if (process.env.PREVIEW) {
  const pdir = join(ROOT, 'out', 'preview')
  rmSync(pdir, { recursive: true, force: true })
  mkdirSync(pdir, { recursive: true })
  for (let i = 0; i < meta.beats.length; i++) {
    const b = await prepBeat(meta.beats[i], i, [VOICES[0]])
    for (const [tag, t] of [['a-establish', 0.05], ['b-zoom', 1.4], ['c-settled', Math.min(b.L * 0.8, b.L - 0.6)]]) {
      writeFileSync(join(pdir, `${i}-${b.id}-${tag}.png`), b.drawFrame(t))
    }
    process.stdout.write(`preview ${b.id}\n`)
  }
  console.log('PREVIEW_DONE', pdir)
  process.exit(0)
}

// --- render frames once, then mux + stitch each voice -----------------------
const beats = []
for (let i = 0; i < meta.beats.length; i++) {
  process.stdout.write(`prep beat ${i + 1}/${meta.beats.length} (${meta.beats[i].id}) — voices: ${VOICES.join(', ')}\n`)
  beats.push(await prepBeat(meta.beats[i], i))
}
process.stdout.write('rendering frames (shared across voices)…\n')
for (const b of beats) renderFrames(b)

const outputs = []
for (const voice of VOICES) {
  process.stdout.write(`stitching voice "${voice}"…\n`)
  const clips = beats.map((b) => encodeClip(b, voice))
  const out = VOICES.length > 1 ? join(ROOT, 'out', `walkthrough-${voice}.mp4`) : OUT
  stitch(clips, out)
  outputs.push({ voice, out, dur: probeDur(out) })
}

console.log(`\n✅ done — ${beats.length} beats, ${CW}x${CH}@${FPS}fps, engine=${ttsEngine()}`)
for (const o of outputs) console.log(`   ${o.voice.padEnd(8)} ${o.dur.toFixed(1)}s  ${o.out}`)
