import { useEffect, useRef, useState, useCallback } from 'react'
import { normaliseBarcode, isValidEan13 } from '../lib/barcode.js'
// URL of the bundled wasm asset (just a string here; Vite emits the binary as a
// separate asset fetched on demand). The heavy reader JS is imported lazily.
import wasmUrl from 'zxing-wasm/reader/zxing_reader.wasm?url'

// Hybrid barcode scanner, mirroring Open Food Facts' smooth-app strategy of
// "use the strongest decoder the platform offers". Three tiers, best first:
//
//  1. Native `BarcodeDetector` — Android Chrome / modern desktop Chromium. The
//     web equivalent of smooth-app's default ML Kit engine.
//  2. zxing-wasm — the C++ ZXing compiled to WebAssembly. Markedly stronger on
//     blurry / curved / low-light 1D codes than the pure-JS port. This is the
//     path iOS Safari and Firefox take (no native BarcodeDetector there).
//  3. @zxing/browser (pure JS) — last-resort fallback if the wasm fails to load.
//
// Manual entry is always available as the human backstop. Tiers 1–2 share one
// rAF "grab a frame and decode it" loop; tier 3 uses ZXing's own continuous
// callback. All paths share the camera stream so the torch toggle is uniform,
// and every accepted code goes through the same normalisation.

// Native BarcodeDetector format ids.
const NATIVE_FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128']
// zxing-wasm format ids (different spelling from the native API).
const WASM_FORMATS = ['EAN13', 'EAN8', 'UPCA', 'UPCE', 'Code128']

const VIDEO_CONSTRAINTS = {
  facingMode: { ideal: 'environment' },
  // More pixels = more bars resolved, which a curved/small barcode needs.
  width: { ideal: 1920 },
  height: { ideal: 1080 },
  // Best-effort sharp focus; ignored by browsers that don't support it.
  focusMode: 'continuous',
  advanced: [{ focusMode: 'continuous' }],
}

async function getNativeDetector() {
  if (typeof globalThis.BarcodeDetector === 'undefined') return null
  try {
    const supported = await globalThis.BarcodeDetector.getSupportedFormats()
    const formats = NATIVE_FORMATS.filter((f) => supported.includes(f))
    if (formats.length === 0) return null
    return new globalThis.BarcodeDetector({ formats })
  } catch {
    return null
  }
}

// Lazily load zxing-wasm and point it at our bundled .wasm (served from our own
// origin, so it works offline and behind a strict egress proxy — no CDN).
let wasmReadyPromise = null
async function ensureWasm() {
  if (!wasmReadyPromise) {
    wasmReadyPromise = (async () => {
      const { readBarcodes, prepareZXingModule } = await import('zxing-wasm/reader')
      await prepareZXingModule({
        overrides: {
          locateFile: (path, prefix) =>
            path.endsWith('.wasm') ? wasmUrl : prefix + path,
        },
        fireImmediately: true,
      })
      return readBarcodes
    })()
  }
  return wasmReadyPromise
}

export default function Scanner({ onDetected, onClose, onManual }) {
  const videoRef = useRef(null)
  const firedRef = useRef(false)
  const teardownRef = useRef(() => {})
  const trackRef = useRef(null)

  const [error, setError] = useState(null)
  const [engine, setEngine] = useState(null) // 'native' | 'wasm' | 'zxing'
  const [torchOn, setTorchOn] = useState(false)
  const [torchAvailable, setTorchAvailable] = useState(false)

  const toggleTorch = useCallback(async () => {
    const track = trackRef.current
    if (!track) return
    const next = !torchOn
    try {
      await track.applyConstraints({ advanced: [{ torch: next }] })
      setTorchOn(next)
    } catch {
      /* some devices report torch but reject the constraint — ignore */
    }
  }, [torchOn])

  useEffect(() => {
    let cancelled = false
    let rafId = null
    let stream = null

    const fire = (raw) => {
      if (firedRef.current) return
      const code = normaliseBarcode(raw)
      if (!code || !isValidEan13(code)) return
      firedRef.current = true
      try { navigator.vibrate?.(60) } catch { /* no-op */ }
      teardownRef.current()
      onDetected(code)
    }

    const wireTorch = () => {
      const track = stream?.getVideoTracks?.()[0] || null
      trackRef.current = track
      const caps = track?.getCapabilities?.() || {}
      if (caps.torch) setTorchAvailable(true)
    }

    // Shared decode loop for the native + wasm engines: pull a frame, hand it to
    // `detect`, and reschedule. Awaiting the async detect paces the loop so we
    // never pile up frames.
    const runFrameLoop = (detect) => {
      const tick = async () => {
        if (cancelled || firedRef.current) return
        try {
          const code = await detect()
          if (code) { fire(code); return }
        } catch { /* transient decode error — keep going */ }
        if (!cancelled && !firedRef.current) rafId = requestAnimationFrame(tick)
      }
      rafId = requestAnimationFrame(tick)
    }

    async function startStream() {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: VIDEO_CONSTRAINTS,
      })
      if (cancelled) return false
      const video = videoRef.current
      video.srcObject = stream
      await video.play().catch(() => {})
      wireTorch()
      teardownRef.current = () => {
        if (rafId) cancelAnimationFrame(rafId)
        stream?.getTracks().forEach((t) => t.stop())
      }
      return true
    }

    function makeWasmDetector(readBarcodes) {
      const canvas = document.createElement('canvas')
      const ctx = canvas.getContext('2d', { willReadFrequently: true })
      return async () => {
        const video = videoRef.current
        const w = video?.videoWidth || 0
        const h = video?.videoHeight || 0
        if (!w || !h) return null
        canvas.width = w
        canvas.height = h
        ctx.drawImage(video, 0, 0, w, h)
        const image = ctx.getImageData(0, 0, w, h)
        const results = await readBarcodes(image, {
          tryHarder: true,
          formats: WASM_FORMATS,
          maxNumberOfSymbols: 1,
        })
        return results?.[0]?.text || null
      }
    }

    async function startZxingBrowser() {
      // Pure-JS last resort: decode continuously off the running <video>.
      const { BrowserMultiFormatReader } = await import('@zxing/browser')
      const { DecodeHintType, BarcodeFormat } = await import('@zxing/library')
      const hints = new Map()
      hints.set(DecodeHintType.POSSIBLE_FORMATS, [
        BarcodeFormat.EAN_13, BarcodeFormat.EAN_8,
        BarcodeFormat.UPC_A, BarcodeFormat.UPC_E, BarcodeFormat.CODE_128,
      ])
      hints.set(DecodeHintType.TRY_HARDER, true)
      const reader = new BrowserMultiFormatReader(hints, { delayBetweenScanAttempts: 150 })
      const controls = await reader.decodeFromVideoElement(
        videoRef.current,
        (result) => { if (result) fire(result.getText()) }
      )
      const stop = teardownRef.current
      teardownRef.current = () => {
        try { controls.stop() } catch { /* no-op */ }
        stop()
      }
    }

    async function start() {
      try {
        const detector = await getNativeDetector()
        if (cancelled) return
        if (!(await startStream())) return // permission/stream failure throws below

        if (detector) {
          setEngine('native')
          runFrameLoop(async () => {
            const codes = await detector.detect(videoRef.current)
            return codes?.[0]?.rawValue || null
          })
          return
        }

        try {
          const readBarcodes = await ensureWasm()
          if (cancelled) return
          setEngine('wasm')
          runFrameLoop(makeWasmDetector(readBarcodes))
        } catch {
          if (cancelled) return
          setEngine('zxing')
          await startZxingBrowser()
        }
      } catch (err) {
        if (cancelled) return
        setError(
          err?.name === 'NotAllowedError'
            ? 'Camera permission denied. Allow camera access, or enter the item manually.'
            : 'Could not start the camera. You can still add an item manually.'
        )
      }
    }

    start()
    return () => {
      cancelled = true
      teardownRef.current()
    }
  }, [onDetected])

  return (
    <div className="scanner-wrap">
      <video ref={videoRef} className="scanner-video" muted playsInline />
      <div className="scanner-overlay">
        <div className="scan-reticle" />
      </div>

      <div className="scanner-topbar">
        <button className="iconbtn" onClick={onClose} aria-label="Close scanner">✕</button>
        <span className="pill">Scan a barcode</span>
        {torchAvailable ? (
          <button
            className="btn ghost"
            onClick={toggleTorch}
            style={{ color: '#fff' }}
            aria-pressed={torchOn}
          >
            {torchOn ? '🔦 On' : '🔦 Light'}
          </button>
        ) : (
          <button className="btn ghost" onClick={onManual} style={{ color: '#fff' }}>
            Manual
          </button>
        )}
      </div>

      <div className="scanner-hint">
        {error
          ? error
          : 'Line up the barcode inside the frame. For round tubs, rotate slowly so the bars flatten.'}
      </div>

      {!error && torchAvailable && (
        <div className="scanner-subhint">
          <button className="linkbtn" onClick={onManual}>Enter barcode manually</button>
        </div>
      )}
    </div>
  )
}
