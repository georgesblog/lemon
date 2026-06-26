import { useEffect, useRef, useState } from 'react'
import { BrowserMultiFormatReader } from '@zxing/browser'
import { DecodeHintType, BarcodeFormat } from '@zxing/library'

// Live barcode scanner. Opens the rear camera, decodes EAN/UPC barcodes and
// fires onDetected(barcode) once. Pure browser — no app store, no native code.
const FORMATS = [
  BarcodeFormat.EAN_13,
  BarcodeFormat.EAN_8,
  BarcodeFormat.UPC_A,
  BarcodeFormat.UPC_E,
  BarcodeFormat.CODE_128,
]

export default function Scanner({ onDetected, onClose, onManual }) {
  const videoRef = useRef(null)
  const controlsRef = useRef(null)
  const firedRef = useRef(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    const hints = new Map()
    hints.set(DecodeHintType.POSSIBLE_FORMATS, FORMATS)
    const reader = new BrowserMultiFormatReader(hints, { delayBetweenScanAttempts: 250 })

    async function start() {
      try {
        const controls = await reader.decodeFromConstraints(
          { video: { facingMode: { ideal: 'environment' } } },
          videoRef.current,
          (result) => {
            if (result && !firedRef.current) {
              firedRef.current = true
              const code = result.getText()
              try { navigator.vibrate?.(60) } catch { /* no-op */ }
              controls.stop()
              onDetected(code)
            }
          }
        )
        if (cancelled) controls.stop()
        else controlsRef.current = controls
      } catch (err) {
        if (!cancelled) {
          setError(
            err?.name === 'NotAllowedError'
              ? 'Camera permission denied. Allow camera access, or enter the item manually.'
              : 'Could not start the camera. You can still add an item manually.'
          )
        }
      }
    }

    start()
    return () => {
      cancelled = true
      try { controlsRef.current?.stop() } catch { /* no-op */ }
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
        <button className="btn ghost" onClick={onManual} style={{ color: '#fff' }}>
          Manual
        </button>
      </div>

      <div className="scanner-hint">
        {error ? error : 'Line up the barcode inside the frame'}
      </div>
    </div>
  )
}
