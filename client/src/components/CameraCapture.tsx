import React, { useRef, useState, useEffect } from "react";
import { Camera, X, AlertCircle, Zap } from "lucide-react";

interface CameraCaptureProps {
  onCapture: (blob: Blob) => void;
  onClose: () => void;
}

export const CameraCapture: React.FC<CameraCaptureProps> = ({ onCapture, onClose }) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const [torchEnabled, setTorchEnabled] = useState(false);
  const [hasTorch, setHasTorch] = useState(false);

  useEffect(() => {
    let activeStream: MediaStream | null = null;

    const startCamera = async () => {
      try {
        setError(null);
        // Request environment (back) camera with optimal resolution
        const mediaStream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
          audio: false,
        });

        activeStream = mediaStream;
        setStream(mediaStream);

        if (videoRef.current) {
          videoRef.current.srcObject = mediaStream;
          videoRef.current.play();
        }

        // Check if flashlight / torch capability is available
        const track = mediaStream.getVideoTracks()[0];
        const capabilities = track.getCapabilities?.() as any;
        if (capabilities && "torch" in capabilities) {
          setHasTorch(true);
        }
      } catch (err: any) {
        console.error("Camera access error:", err);
        if (err.name === "NotAllowedError") {
          setError("Camera permission denied. Please enable camera access in your browser settings.");
        } else if (err.name === "NotFoundError") {
          setError("No camera device found on this system.");
        } else {
          setError(`Unable to start camera: ${err.message || "Unknown error"}`);
        }
      }
    };

    startCamera();

    return () => {
      if (activeStream) {
        activeStream.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  const toggleTorch = async () => {
    if (!stream) return;
    const track = stream.getVideoTracks()[0];
    try {
      const nextTorch = !torchEnabled;
      await (track as any).applyConstraints({
        advanced: [{ torch: nextTorch }],
      });
      setTorchEnabled(nextTorch);
    } catch (e) {
      console.warn("Torch toggle failed:", e);
    }
  };

  const handleCapture = () => {
    if (!videoRef.current) return;
    setIsCapturing(true);

    const video = videoRef.current;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;

    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(
        (blob) => {
          setIsCapturing(false);
          if (blob) {
            onCapture(blob);
          }
        },
        "image/jpeg",
        0.95
      );
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col justify-between">
      {/* Top Header */}
      <div className="flex items-center justify-between p-4 bg-gradient-to-b from-black/80 to-transparent z-10">
        <button
          onClick={onClose}
          className="p-2 rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors"
          title="Close Camera"
        >
          <X className="w-6 h-6" />
        </button>

        <span className="text-white font-medium text-sm tracking-wide">
          Align Sheet Corners Within Frame
        </span>

        {hasTorch ? (
          <button
            onClick={toggleTorch}
            className={`p-2 rounded-full transition-colors ${
              torchEnabled ? "bg-amber-400 text-slate-900" : "bg-white/10 text-white hover:bg-white/20"
            }`}
            title="Toggle Flashlight"
          >
            <Zap className="w-6 h-6" />
          </button>
        ) : (
          <div className="w-10" />
        )}
      </div>

      {/* Main Viewport & Overlay Guides */}
      <div className="relative flex-1 flex items-center justify-center overflow-hidden">
        {error ? (
          <div className="text-center p-6 max-w-sm bg-slate-900/90 rounded-2xl border border-red-500/30 text-white">
            <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-3" />
            <h3 className="text-lg font-bold mb-2">Camera Unavailable</h3>
            <p className="text-sm text-slate-300 mb-6">{error}</p>
            <button
              onClick={onClose}
              className="w-full py-2.5 px-4 rounded-xl bg-white/20 hover:bg-white/30 font-semibold text-sm transition-colors"
            >
              Use File Upload Instead
            </button>
          </div>
        ) : (
          <>
            <video
              ref={videoRef}
              playsInline
              muted
              autoPlay
              className="absolute inset-0 w-full h-full object-cover"
            />

            {/* OMR Alignment Guide Box */}
            <div className="relative w-[82vw] max-w-sm h-[72vh] border-2 border-indigo-400/80 rounded-xl pointer-events-none shadow-[0_0_0_9999px_rgba(0,0,0,0.55)]">
              {/* Corner Indicators */}
              <div className="absolute -top-3 -left-3 w-7 h-7 border-t-4 border-l-4 border-white rounded-tl" />
              <div className="absolute -top-3 -right-3 w-7 h-7 border-t-4 border-r-4 border-white rounded-tr" />
              <div className="absolute -bottom-3 -left-3 w-7 h-7 border-b-4 border-l-4 border-white rounded-bl" />
              <div className="absolute -bottom-3 -right-3 w-7 h-7 border-b-4 border-r-4 border-white rounded-br" />

              <div className="absolute inset-x-0 bottom-4 text-center">
                <span className="bg-black/60 backdrop-blur text-white text-xs px-3 py-1.5 rounded-full font-medium">
                  Align sheet within frame • Questions and details will auto-detect
                </span>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Shutter Controls */}
      <div className="p-6 bg-gradient-to-t from-black/90 to-transparent flex items-center justify-center z-10">
        {!error && (
          <button
            onClick={handleCapture}
            disabled={isCapturing}
            className="w-20 h-20 rounded-full border-4 border-white flex items-center justify-center p-1 active:scale-95 transition-transform"
          >
            <div className="w-full h-full bg-indigo-600 rounded-full flex items-center justify-center hover:bg-indigo-500 transition-colors">
              <Camera className="w-8 h-8 text-white" />
            </div>
          </button>
        )}
      </div>
    </div>
  );
};
