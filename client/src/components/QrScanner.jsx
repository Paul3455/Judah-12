import { useEffect, useRef, useState } from 'react';

/**
 * Camera QR scanning with the platform BarcodeDetector. Feature-detected: on
 * browsers without it we say so plainly and the six-digit code path stays
 * available, which is what keeps check-in to three taps everywhere.
 */
export default function QrScanner({ onDetected, onClose }) {
  const videoRef = useRef(null);
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let stream = null;
    let frame = 0;

    const start = async () => {
      if (!('BarcodeDetector' in window)) {
        setError('This browser cannot scan QR codes. Type the six-digit code instead.');
        return;
      }
      if (!navigator.mediaDevices?.getUserMedia) {
        setError('No camera available in this browser. Type the six-digit code instead.');
        return;
      }

      try {
        const detector = new window.BarcodeDetector({ formats: ['qr_code'] });
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        if (cancelled) return;
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setReady(true);

        const scan = async () => {
          if (cancelled) return;
          try {
            const codes = await detector.detect(videoRef.current);
            if (codes.length && codes[0].rawValue) {
              onDetected(codes[0].rawValue);
              return;
            }
          } catch {
            /* a dropped frame is not a failure */
          }
          frame = window.setTimeout(scan, 220);
        };
        scan();
      } catch {
        setError('Camera permission was refused or unavailable. Type the six-digit code instead.');
      }
    };

    start();

    return () => {
      cancelled = true;
      window.clearTimeout(frame);
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, [onDetected]);

  return (
    <div className="stack">
      {error ? (
        <div className="banner banner-warn">{error}</div>
      ) : (
        <>
          <div className="video-frame">
            {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
            <video ref={videoRef} muted playsInline />
            <div className="scan-box" aria-hidden="true" />
          </div>
          <p className="small muted center">{ready ? 'Point the camera at the code on the screen.' : 'Starting camera…'}</p>
        </>
      )}
      <button type="button" className="btn btn-secondary" onClick={onClose}>
        Enter the code instead
      </button>
    </div>
  );
}
