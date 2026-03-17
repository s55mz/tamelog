import { useEffect, useRef, useState } from "react";

type ReceiptCameraProps = {
  disabled?: boolean;
  onCapture: (payload: { imageBase64: string; mimeType: string; previewUrl: string }) => Promise<void> | void;
};

const MIME_TYPE = "image/jpeg";

function stopStream(stream: MediaStream | null) {
  stream?.getTracks().forEach((track) => track.stop());
}

export function ReceiptCamera({ disabled, onCapture }: ReceiptCameraProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [open, setOpen] = useState(false);
  const [opening, setOpening] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [error, setError] = useState("");

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopStream(streamRef.current);
      streamRef.current = null;
    };
  }, []);

  // When overlay opens, attach the stream to the video element
  useEffect(() => {
    if (!open) return;
    const video = videoRef.current;
    if (!video || !streamRef.current) return;
    video.srcObject = streamRef.current;
    video.play().catch(() => {});
  }, [open]);

  const openCamera = async () => {
    if (!navigator.mediaDevices?.getUserMedia || disabled) {
      setError("この端末ではカメラを起動できません");
      return;
    }
    setOpening(true);
    setError("");
    try {
      stopStream(streamRef.current);
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1920 },
          height: { ideal: 1080 }
        }
      });
      streamRef.current = stream;
      setOpen(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "カメラを起動できませんでした");
    } finally {
      setOpening(false);
    }
  };

  const closeCamera = () => {
    stopStream(streamRef.current);
    streamRef.current = null;
    setOpen(false);
    setError("");
  };

  const captureFrame = async () => {
    const video = videoRef.current;
    if (!video || disabled) return;

    setCapturing(true);
    setError("");

    try {
      // Wait for video dimensions — poll with rAF up to 8 seconds
      if (!video.videoWidth || !video.videoHeight) {
        await new Promise<void>((resolve, reject) => {
          const deadline = Date.now() + 8000;
          const tick = () => {
            if (video.videoWidth > 0 && video.videoHeight > 0) {
              resolve();
            } else if (Date.now() > deadline) {
              reject(new Error("カメラの映像を取得できませんでした。もう一度お試しください"));
            } else {
              requestAnimationFrame(tick);
            }
          };
          requestAnimationFrame(tick);
        });
      }

      const sw = video.videoWidth;
      const sh = video.videoHeight;
      const scale = Math.min(1, 1600 / Math.max(sw, sh));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(sw * scale);
      canvas.height = Math.round(sh * scale);
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("画像変換に失敗しました");
      ctx.drawImage(video, 0, 0, sw, sh, 0, 0, canvas.width, canvas.height);
      const preview = canvas.toDataURL(MIME_TYPE, 0.84);
      const imageBase64 = preview.split(",")[1] ?? "";

      closeCamera();
      await onCapture({ imageBase64, mimeType: MIME_TYPE, previewUrl: preview });
    } catch (err) {
      setCapturing(false);
      setError(err instanceof Error ? err.message : "撮影に失敗しました");
    }
  };

  return (
    <>
      <button
        className="btn btn--out"
        disabled={opening || disabled}
        onClick={() => void openCamera()}
        type="button"
        style={{ width: "100%", minHeight: "52px" }}
      >
        <span className="material-symbols-outlined">photo_camera</span>
        {opening ? "起動中..." : "カメラで撮影"}
      </button>

      {error ? <p className="err-msg">{error}</p> : null}

      {open ? (
        <div className="ocr-overlay">
          <div className="ocr-overlay__header">
            <button
              aria-label="閉じる"
              className="ocr-overlay__close"
              onClick={closeCamera}
              type="button"
            >
              <span className="material-symbols-outlined">close</span>
            </button>
            <p className="ocr-overlay__title">レシートを枠内に合わせて撮影</p>
            <div style={{ width: 40 }} />
          </div>

          <video
            ref={videoRef}
            autoPlay
            className="ocr-overlay__video"
            muted
            playsInline
          />

          <div aria-hidden="true" className="ocr-overlay__frame-wrap">
            <div className="ocr-overlay__frame-box" />
          </div>

          <div className="ocr-overlay__footer">
            <button
              aria-label="撮影"
              className={`ocr-overlay__shutter${capturing ? " ocr-overlay__shutter--loading" : ""}`}
              disabled={capturing}
              onClick={() => void captureFrame()}
              type="button"
            >
              <span className="ocr-overlay__shutter-inner" />
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
