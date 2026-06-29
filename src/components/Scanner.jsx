import { useEffect, useRef, useState, useCallback } from 'react'
import { normaliseBarcode, isValidEan13 } from '../lib/barcode.js'

// Hybrid barcode scanner, mirroring Open Food Facts' smooth-app strategy:
// prefer the platform's native ML-based detector, fall back to ZXing.
//
//  • Native `BarcodeDetector` (Android Chrome, modern desktop Chromium) is the
//    web equivalent of smooth-app's default ML Kit engine — far more robust on
//    blurry / curved / low-light barcodes, and ZXing never even downloads.
//  • ZXing-JS is the fallback for browsers without it — notably *all* iOS
//    browsers (WebKit has no BarcodeDetector) and Firefox. We push it harder
//    than the defaults: TRY_HARDER, high resolution, and continuous focus.
//
// Both paths share one camera stream so the torch toggle works regardless of
// engine, and both run scanned codes through the same normalisation.

// Grocery 1D set + Code-128, matching smooth-app's restricted format list.
const NATIVE_FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128']

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

export default function Scanner({ onDetected, onClose, onManual }) {
  const videoRef = useRef(null)
  const firedRef = useRef(false)
  const teardownRef = useRef(() => {})
  const trackRef = useRef(null)

  const [error, setError] = useState(null)
  const [engine, setEngine] = useState(null) // 'native' | 'zxing'
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

    async function startNative(detector) {
      setEngine('native')
      stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: VIDEO_CONSTRAINTS,
      })
      if (cancelled) return
      const video = videoRef.current
      video.srcObject = stream
      await video.play().catch(() => {})
      wireTorch()

      const scan = async () => {
        if (cancelled || firedRef.current) return
        try {
          const codes = await detector.detect(video)
          if (codes && codes.length) {
            fire(codes[0].rawValue)
            return
          }
        } catch { /* transient decode error — keep going */ }
        rafId = requestAnimationFrame(scan)
      }
      rafId = requestAnimationFrame(scan)

      teardownRef.current = () => {
        if (rafId) cancelAnimationFrame(rafId)
        stream?.getTracks().forEach((t) => t.stop())
      }
    }

    async function startZxing() {
      setEngine('zxing')
      const { BrowserMultiFormatReader } = await import('@zxing/browser')
      const { DecodeHintType, BarcodeFormat } = await import('@zxing/library')

      const hints = new Map()
      hints.set(DecodeHintType.POSSIBLE_FORMATS, [
        BarcodeFormat.EAN_13,
        BarcodeFormat.EAN_8,
        BarcodeFormat.UPC_A,
        BarcodeFormat.UPC_E,
        BarcodeFormat.CODE_128,
      ])
      // The decisive setting for degraded/curved barcodes: ZXing's exhaustive
      // pass (rotations + harder search) instead of the default fast scan.
      hints.set(DecodeHintType.TRY_HARDER, true)

      const reader = new BrowserMultiFormatReader(hints, {
        delayBetweenScanAttempts: 150,
      })
      const controls = await reader.decodeFromConstraints(
        { audio: false, video: VIDEO_CONSTRAINTS },
        videoRef.current,
        (result) => { if (result) fire(result.getText()) }
      )
      // decodeFromConstraints created the stream on the <video>; grab it so the
      // torch toggle and teardown can reach the track.
      stream = videoRef.current?.srcObject || null
      wireTorch()

      teardownRef.current = () => {
        try { controls.stop() } catch { /* no-op */ }
      }
    }

    async function start() {
      try {
        const detector = await getNativeDetector()
        if (cancelled) return
        if (detector) await startNative(detector)
        else await startZxing()
        if (cancelled) teardownRef.current()
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
