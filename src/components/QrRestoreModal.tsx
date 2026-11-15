import { useCallback, useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';
import { Camera, ImageUp, Link2, Loader2, Upload, X } from 'lucide-react';

interface QrRestoreModalProps {
  open: boolean;
  onClose: () => void;
  onDetectedText: (rawText: string) => Promise<string | null> | string | null;
  onPickJsonFile: () => void;
}

type RestoreTab = 'camera' | 'image' | 'paste';

export function QrRestoreModal({
  open,
  onClose,
  onDetectedText,
  onPickJsonFile,
}: QrRestoreModalProps) {
  const [tab, setTab] = useState<RestoreTab>('camera');
  const [cameraBusy, setCameraBusy] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const [statusError, setStatusError] = useState('');
  const [pasteInput, setPasteInput] = useState('');
  const [processing, setProcessing] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<number>(0);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const scanningLockRef = useRef(false);

  const stopCamera = useCallback(() => {
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = 0;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraBusy(false);
  }, []);

  const handleDecoded = useCallback(
    async (text: string) => {
      if (scanningLockRef.current) return;
      scanningLockRef.current = true;
      setProcessing(true);
      setStatusError('');
      try {
        const err = await onDetectedText(text.trim());
        if (err) {
          setStatusError(err);
          scanningLockRef.current = false;
        } else {
          stopCamera();
        }
      } finally {
        setProcessing(false);
      }
    },
    [onDetectedText, stopCamera]
  );

  // Start / stop live camera scanning when modal is open and Camera tab is active
  useEffect(() => {
    if (!open || tab !== 'camera') {
      stopCamera();
      return;
    }

    let cancelled = false;
    scanningLockRef.current = false;
    setCameraError('');
    setStatusError('');

    const startCamera = async () => {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setCameraError(
          'Live camera is not available in this browser view. Use “Upload QR image” or “Paste link” below.'
        );
        return;
      }

      setCameraBusy(true);
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
        setCameraBusy(false);

        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d', { willReadFrequently: true });

        timerRef.current = window.setInterval(() => {
          const video = videoRef.current;
          if (
            cancelled ||
            scanningLockRef.current ||
            !video ||
            !ctx ||
            video.readyState < 2 ||
            !video.videoWidth ||
            !video.videoHeight
          ) {
            return;
          }
          const maxDim = 720;
          const scale = Math.min(1, maxDim / Math.max(video.videoWidth, video.videoHeight));
          const w = Math.max(1, Math.round(video.videoWidth * scale));
          const h = Math.max(1, Math.round(video.videoHeight * scale));
          canvas.width = w;
          canvas.height = h;
          ctx.drawImage(video, 0, 0, w, h);
          const imgData = ctx.getImageData(0, 0, w, h);
          const code = jsQR(imgData.data, w, h, { inversionAttempts: 'attemptBoth' });
          if (code && code.data) {
            void handleDecoded(code.data);
          }
        }, 160);
      } catch {
        if (!cancelled) {
          setCameraBusy(false);
          setCameraError(
            'Camera permission was denied or unavailable. You can still upload a saved QR photo or paste your restore link.'
          );
        }
      }
    };

    void startCamera();

    return () => {
      cancelled = true;
      stopCamera();
    };
  }, [open, tab, handleDecoded, stopCamera]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        stopCamera();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose, stopCamera]);

  if (!open) return null;

  const handleImagePick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setProcessing(true);
    setStatusError('');
    scanningLockRef.current = false;

    try {
      const url = URL.createObjectURL(file);
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const el = new Image();
        el.onload = () => {
          URL.revokeObjectURL(url);
          resolve(el);
        };
        el.onerror = () => {
          URL.revokeObjectURL(url);
          reject(new Error('Could not read image'));
        };
        el.src = url;
      });

      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) throw new Error('Canvas unavailable');

      let decoded: string | null = null;
      // Try multiple scales for screenshots vs crisp PNGs
      for (const maxDim of [1200, 720, 480]) {
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        canvas.width = w;
        canvas.height = h;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        const imgData = ctx.getImageData(0, 0, w, h);
        const res = jsQR(imgData.data, w, h, { inversionAttempts: 'attemptBoth' });
        if (res && res.data) {
          decoded = res.data;
          break;
        }
      }

      if (!decoded) {
        setStatusError('No readable QR code found in that image. Make sure the full QR square is visible.');
        setProcessing(false);
        return;
      }

      await handleDecoded(decoded);
    } catch {
      setStatusError('Could not read that image file.');
      setProcessing(false);
    }
  };

  const handlePasteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pasteInput.trim()) {
      setStatusError('Paste a restore link or QR code text first.');
      return;
    }
    scanningLockRef.current = false;
    await handleDecoded(pasteInput);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="qr-restore-title"
      onClick={() => {
        stopCamera();
        onClose();
      }}
    >
      <div
        className="w-full max-w-md max-h-[92vh] overflow-y-auto rounded-2xl bg-white dark:bg-slate-900 border border-stone-200 dark:border-slate-800 shadow-2xl p-5 sm:p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 id="qr-restore-title" className="text-lg font-semibold text-stone-900 dark:text-slate-100">
              Restore backup
            </h3>
            <p className="text-xs sm:text-sm text-stone-500 dark:text-slate-400 mt-0.5">
              Scan a Restore QR code, pick a saved QR screenshot, paste a restore link, or load a backup file.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              stopCamera();
              onClose();
            }}
            aria-label="Close restore dialog"
            className="min-h-[40px] min-w-[40px] inline-flex items-center justify-center rounded-xl text-stone-500 hover:text-stone-800 dark:text-slate-400 dark:hover:text-slate-100 hover:bg-stone-100 dark:hover:bg-slate-800 shrink-0 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Mode selector tabs */}
        <div className="mt-4 grid grid-cols-3 gap-1.5 p-1 rounded-xl bg-stone-100 dark:bg-slate-950 border border-stone-200/80 dark:border-slate-800">
          {(
            [
              { id: 'camera', label: 'Camera', Icon: Camera },
              { id: 'image', label: 'QR image', Icon: ImageUp },
              { id: 'paste', label: 'Paste link', Icon: Link2 },
            ] as const
          ).map(({ id, label, Icon }) => {
            const active = tab === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => {
                  setStatusError('');
                  setTab(id);
                }}
                className={`min-h-[38px] px-2 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer transition-colors ${
                  active
                    ? 'bg-white dark:bg-slate-800 text-stone-900 dark:text-slate-100 shadow-sm'
                    : 'text-stone-600 dark:text-slate-400 hover:text-stone-900 dark:hover:text-slate-200'
                }`}
              >
                <Icon className="w-3.5 h-3.5 shrink-0" />
                <span>{label}</span>
              </button>
            );
          })}
        </div>

        {/* Tab content */}
        <div className="mt-4">
          {tab === 'camera' && (
            <div className="space-y-3">
              <div className="relative aspect-square max-h-64 w-full mx-auto rounded-2xl overflow-hidden bg-stone-950 border border-stone-200 dark:border-slate-800 flex items-center justify-center">
                {cameraError ? (
                  <div className="p-5 text-center space-y-3">
                    <p className="text-xs sm:text-sm text-stone-300 leading-relaxed">{cameraError}</p>
                    <div className="flex flex-wrap justify-center gap-2">
                      <button
                        type="button"
                        onClick={() => setTab('image')}
                        className="min-h-[38px] px-3.5 py-1.5 rounded-xl bg-[var(--accent)] text-white text-xs font-semibold cursor-pointer"
                      >
                        Upload QR image
                      </button>
                      <button
                        type="button"
                        onClick={() => setTab('paste')}
                        className="min-h-[38px] px-3.5 py-1.5 rounded-xl bg-white/10 text-white text-xs font-medium cursor-pointer"
                      >
                        Paste link
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <video
                      ref={videoRef}
                      playsInline
                      muted
                      autoPlay
                      className="w-full h-full object-cover"
                    />
                    <div
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-6 rounded-2xl border-2 border-white/75 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]"
                    />
                    {(cameraBusy || processing) && (
                      <div className="absolute inset-0 flex items-center justify-center bg-black/45 text-white text-xs font-medium gap-2">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>{processing ? 'Reading backup…' : 'Starting camera…'}</span>
                      </div>
                    )}
                  </>
                )}
              </div>
              {!cameraError && (
                <p className="text-xs text-center text-stone-500 dark:text-slate-400">
                  Point your camera at a Camp Split Restore QR code. Your current logo and PIN stay safe.
                </p>
              )}
            </div>
          )}

          {tab === 'image' && (
            <div className="space-y-3">
              <input
                ref={imageInputRef}
                type="file"
                accept="image/*"
                onChange={(e) => void handleImagePick(e)}
                className="hidden"
              />
              <button
                type="button"
                disabled={processing}
                onClick={() => imageInputRef.current?.click()}
                className="w-full min-h-[132px] rounded-2xl border-2 border-dashed border-stone-300 dark:border-slate-700 hover:border-[var(--accent)] bg-stone-50 dark:bg-slate-950/60 p-5 flex flex-col items-center justify-center gap-2 text-center cursor-pointer transition-colors disabled:opacity-60"
              >
                {processing ? (
                  <Loader2 className="w-6 h-6 animate-spin text-[var(--accent)]" />
                ) : (
                  <ImageUp className="w-7 h-7 text-[var(--accent)]" />
                )}
                <span className="text-sm font-semibold text-stone-900 dark:text-slate-100">
                  {processing ? 'Decoding QR image…' : 'Choose QR image or screenshot'}
                </span>
                <span className="text-xs text-stone-500 dark:text-slate-400">
                  Works with PNG images saved from “Save QR” or phone screenshots
                </span>
              </button>
            </div>
          )}

          {tab === 'paste' && (
            <form onSubmit={(e) => void handlePasteSubmit(e)} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-stone-500 dark:text-slate-400 mb-1.5">
                  Restore link (or copied backup URL)
                </label>
                <textarea
                  rows={4}
                  value={pasteInput}
                  onChange={(e) => setPasteInput(e.target.value)}
                  placeholder="https://…/#restore=…"
                  className="w-full rounded-xl border border-stone-200 dark:border-slate-700 bg-stone-50 dark:bg-slate-950 px-3 py-2.5 text-xs font-mono text-stone-900 dark:text-slate-100 placeholder:text-stone-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
                />
              </div>
              <button
                type="submit"
                disabled={processing}
                className="w-full min-h-[42px] px-4 py-2 rounded-xl bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-sm font-semibold cursor-pointer disabled:opacity-50"
              >
                {processing ? 'Checking backup…' : 'Restore from link'}
              </button>
            </form>
          )}
        </div>

        {statusError && (
          <p className="mt-3 text-xs font-medium text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 rounded-xl px-3 py-2">
            {statusError}
          </p>
        )}

        <div className="mt-4 pt-3.5 border-t border-stone-100 dark:border-slate-800 flex items-center justify-between gap-2">
          <span className="text-xs text-stone-500 dark:text-slate-400">Have a .json backup file?</span>
          <button
            type="button"
            onClick={() => {
              stopCamera();
              onClose();
              onPickJsonFile();
            }}
            className="min-h-[36px] px-3 py-1.5 rounded-lg border border-stone-200 dark:border-slate-700 text-xs font-medium text-stone-700 dark:text-slate-200 hover:bg-stone-50 dark:hover:bg-slate-800 inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Restore JSON file</span>
          </button>
        </div>
      </div>
    </div>
  );
}
