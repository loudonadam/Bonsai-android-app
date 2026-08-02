import React, { useEffect, useRef, useState } from 'react';
import { Camera, X, RotateCw, Check, AlertCircle, RefreshCw } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface WebcamCaptureProps {
  onCapture: (base64: string, file: File) => void;
  onClose: () => void;
}

export default function WebcamCapture({ onCapture, onClose }: WebcamCaptureProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('environment');
  const [loading, setLoading] = useState(true);

  // Initialize and list video devices
  useEffect(() => {
    let active = true;
    let localStream: MediaStream | null = null;

    async function initCamera() {
      setLoading(true);
      setError(null);

      // Stop anything that might be running
      if (videoRef.current && videoRef.current.srcObject) {
        const preStream = videoRef.current.srcObject as MediaStream;
        preStream.getTracks().forEach(track => {
          try {
            track.stop();
          } catch (e) {
            console.warn("Error stopping track", e);
          }
        });
        videoRef.current.srcObject = null;
      }

      try {
        // Wait 100ms to allow hardware release
        await new Promise(resolve => setTimeout(resolve, 100));

        if (!active) return;

        // Try getting user media
        const initStream = await navigator.mediaDevices.getUserMedia({ 
          video: { facingMode } 
        });
        
        if (!active) {
          initStream.getTracks().forEach(track => track.stop());
          return;
        }

        localStream = initStream;

        // Enumerate devices to allow camera toggling
        const allDevices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = allDevices.filter(d => d.kind === 'videoinput');
        setDevices(videoDevices);
        
        // Match stream tracks to select active device id
        const activeTrack = initStream.getVideoTracks()[0];
        const activeSettings = activeTrack ? activeTrack.getSettings() : null;
        if (activeSettings?.deviceId) {
          setSelectedDeviceId(activeSettings.deviceId);
        } else if (videoDevices.length > 0) {
          setSelectedDeviceId(videoDevices[0].deviceId);
        }
        
        if (videoRef.current) {
          videoRef.current.srcObject = initStream;
        }
        setStream(initStream);
      } catch (err: any) {
        console.error("Webcam access error:", err);
        if (active) {
          setError(
            err.name === 'NotAllowedError' 
              ? "Camera permission denied. Please allow camera access in your browser settings."
              : "No camera found or camera access failed. Please ensure your device has an active webcam."
          );
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    initCamera();

    return () => {
      active = false;
      if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
      }
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
    };
  }, [facingMode]);

  // Switch to a chosen camera device
  const handleDeviceChange = async (deviceId: string) => {
    // Explicitly stop the active stream and clear srcObject
    if (stream) {
      stream.getTracks().forEach(track => {
        try {
          track.stop();
        } catch (e) {
          console.warn("Error stopping track", e);
        }
      });
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setStream(null);
    setLoading(true);
    setSelectedDeviceId(deviceId);

    // Wait 150ms to ensure the hardware is fully released by the OS/browser
    await new Promise(resolve => setTimeout(resolve, 150));

    // Try exact deviceId constraint, fallback to standard deviceId ideal if it fails
    try {
      const newStream = await navigator.mediaDevices.getUserMedia({
        video: { deviceId: { exact: deviceId } }
      });
      if (videoRef.current) {
        videoRef.current.srcObject = newStream;
      }
      setStream(newStream);
    } catch (err) {
      console.warn("Failed exact constraint getUserMedia, attempting ideal fallback...", err);
      try {
        const newStream = await navigator.mediaDevices.getUserMedia({
          video: { deviceId: deviceId }
        });
        if (videoRef.current) {
          videoRef.current.srcObject = newStream;
        }
        setStream(newStream);
      } catch (fallbackErr) {
        console.error("Failed fallback camera switch, switching to generic facingMode:", fallbackErr);
        try {
          const newStream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode }
          });
          if (videoRef.current) {
            videoRef.current.srcObject = newStream;
          }
          setStream(newStream);
        } catch (lastErr) {
          console.error("All camera switch attempts failed:", lastErr);
          setError("Failed to stream from selected camera. Let's try another one.");
        }
      }
    } finally {
      setLoading(false);
    }
  };

  // Toggle general user (front) vs environment (back) camera
  const toggleFacingMode = () => {
    if (stream) {
      stream.getTracks().forEach(track => {
        try {
          track.stop();
        } catch (e) {
          console.warn("Error stopping track", e);
        }
      });
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setStream(null);
    setCapturedImage(null);
    setFacingMode(prev => prev === 'user' ? 'environment' : 'user');
  };

  const capturePhoto = () => {
    if (!videoRef.current || !canvasRef.current) return;
    
    const video = videoRef.current;
    const canvas = canvasRef.current;
    
    // Set canvas dimensions identical to the actual streaming video size
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    // If we're using front camera, mirror the image for natural look
    if (facingMode === 'user') {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }
    
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    
    // Convert to target base64 image URL
    const dataUrl = canvas.toDataURL('image/jpeg', 0.95);
    setCapturedImage(dataUrl);
  };

  const confirmPhoto = () => {
    if (!capturedImage) return;
    
    try {
      // Convert data URL back into a standard file representation
      const arr = capturedImage.split(',');
      const mime = arr[0].match(/:(.*?);/)?.[1] || 'image/jpeg';
      const bstr = atob(arr[1]);
      let n = bstr.length;
      const u8arr = new Uint8Array(n);
      while (n--) {
        u8arr[n] = bstr.charCodeAt(n);
      }
      const filename = `snapshot_${Date.now()}.jpg`;
      const file = new File([u8arr], filename, { type: mime });
      
      onCapture(capturedImage, file);
    } catch (err) {
      console.error("Failed to extract snapshot file content:", err);
      setError("Failed to process captured snapshot file.");
    }
  };

  return (
    <div className="fixed inset-0 bg-stone-900/80 backdrop-blur-xs flex items-center justify-center p-4 z-[100] text-left">
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        className="bg-stone-950 border border-stone-800 rounded-[32px] overflow-hidden max-w-lg w-full shadow-2xl relative flex flex-col max-h-[90vh]"
      >
        {/* Header bar */}
        <div className="bg-stone-900 border-b border-stone-800 px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Camera className="w-4 h-4 text-emerald-500" />
            <h3 className="text-xs font-mono font-bold text-stone-200 uppercase tracking-wide">
              Live Camera Capture
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 hover:bg-stone-800 text-stone-400 hover:text-stone-200 rounded-full transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Live feed / captured view screen */}
        <div className="flex-1 bg-stone-900 relative flex items-center justify-center overflow-hidden min-h-[320px] max-h-[460px]">
          {loading && (
            <div className="absolute inset-0 flex flex-col items-center justify-center space-y-3 z-10 bg-stone-900/90">
              <RefreshCw className="w-8 h-8 animate-spin text-emerald-500" />
              <p className="text-[11px] font-mono text-stone-400">Initializing video device stream...</p>
            </div>
          )}

          {error && (
            <div className="absolute inset-0 p-6 flex flex-col items-center justify-center text-center space-y-3 bg-stone-950 text-stone-200 z-10">
              <AlertCircle className="w-12 h-12 text-rose-500/90" />
              <p className="text-xs font-medium text-stone-300 max-w-xs">{error}</p>
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-1.5 bg-stone-800 hover:bg-stone-700 text-stone-200 text-xs font-semibold rounded-xl transition cursor-pointer"
              >
                Close and Upload File Instead
              </button>
            </div>
          )}

          {/* Canvas for snapshot rendering */}
          <canvas ref={canvasRef} className="hidden" />

          {/* Active Streaming Feed */}
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className={`w-full h-full object-cover aspect-video bg-stone-950 ${
              facingMode === 'user' ? 'scale-x-[-1]' : ''
            } ${capturedImage ? 'hidden' : 'block'}`}
          />

          {/* Captured Preview */}
          {capturedImage && (
            <img
              src={capturedImage || undefined}
              alt="Snapshot snapshot"
              className="w-full h-full object-contain aspect-video bg-stone-950"
            />
          )}

          {/* Top Floating Controls */}
          {!error && !loading && !capturedImage && devices.length > 1 && (
            <div className="absolute top-3 left-3 bg-black/60 backdrop-blur-md border border-stone-800 rounded-xl px-2.5 py-1 z-10">
              <select
                value={selectedDeviceId}
                onChange={(e) => handleDeviceChange(e.target.value)}
                className="bg-transparent border-0 text-[10px] font-mono text-stone-300 focus:outline-none focus:ring-0 cursor-pointer"
              >
                {devices.map((d) => (
                  <option key={d.deviceId} value={d.deviceId} className="bg-stone-900 text-stone-300 text-[10px]">
                    {d.label || `Camera ${devices.indexOf(d) + 1}`}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Shutter / Controls Panel */}
        <div className="bg-stone-950 p-5 border-t border-stone-900 flex flex-col items-center justify-center gap-4">
          {!error && !loading && (
            <div className="flex items-center justify-center gap-6 w-full">
              {!capturedImage ? (
                <>
                  {/* Camera toggle */}
                  <button
                    type="button"
                    onClick={toggleFacingMode}
                    className="p-3 border border-stone-800 hover:bg-stone-900 text-stone-300 rounded-full transition-all cursor-pointer flex items-center justify-center"
                    title="Toggle Front/Back Camera"
                  >
                    <RotateCw className="w-4 h-4" />
                  </button>

                  {/* Primary Shutter Button */}
                  <button
                    type="button"
                    onClick={capturePhoto}
                    className="w-14 h-14 bg-white hover:bg-stone-100 rounded-full border-4 border-stone-800 hover:border-stone-700 flex items-center justify-center shadow-lg transition-transform active:scale-95 cursor-pointer shrink-0"
                    title="Press Shutter"
                  >
                    <div className="w-10 h-10 rounded-full bg-rose-600 hover:bg-rose-500 transition-colors" />
                  </button>

                  {/* Space buffer to balance out layout */}
                  <div className="w-10 h-10" />
                </>
              ) : (
                <div className="flex gap-3 w-full max-w-xs">
                  <button
                    type="button"
                    onClick={() => setCapturedImage(null)}
                    className="flex-1 py-2 bg-stone-900 hover:bg-stone-800 border border-stone-800 text-stone-300 rounded-2xl text-[10px] font-mono font-bold uppercase transition cursor-pointer text-center"
                  >
                    Retake
                  </button>
                  <button
                    type="button"
                    onClick={confirmPhoto}
                    className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl text-[10px] font-mono font-black uppercase transition cursor-pointer text-center"
                  >
                    Use Photo
                  </button>
                </div>
              )}
            </div>
          )}
          <p className="text-[10px] text-stone-500 text-center font-mono leading-relaxed">
            Snapshots will be automatically calibrated, optimized, and saved into your specimen's chronicled registry.
          </p>
        </div>
      </motion.div>
    </div>
  );
}
