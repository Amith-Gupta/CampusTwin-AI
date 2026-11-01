import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Camera,
  CameraOff,
  SwitchCamera,
  Upload,
  AlertCircle,
  Activity,
  Layers,
  Sparkles,
  CheckCircle2,
  Tv,
  Eye,
  Download,
  Sliders,
  Volume2,
  VolumeX
} from 'lucide-react';
import type { Room, DetectionResult } from '../types/campus';
import { api } from '../services/api';

interface PageLiveVisionProps {
  rooms: Room[];
  selectedRoom: Room | null;
  onSelectRoom: (room: Room) => void;
  onNewDetection: (result: DetectionResult) => void;
}

export const PageLiveVision: React.FC<PageLiveVisionProps> = ({
  rooms,
  selectedRoom,
  onSelectRoom,
  onNewDetection,
}) => {
  const [activeMode, setActiveMode] = useState<'webcam' | 'upload'>('webcam');
  const [feedView, setFeedView] = useState<'camera_hud' | 'server_annotated'>('camera_hud');
  const [isCameraActive, setIsCameraActive] = useState<boolean>(false);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [latestResult, setLatestResult] = useState<DetectionResult | null>(null);
  const [fps, setFps] = useState<number>(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Mobile Camera & Facing Mode States (Rear Camera "environment" by default)
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [hasMultipleCameras, setHasMultipleCameras] = useState<boolean>(true);
  const [isSwitchingCamera, setIsSwitchingCamera] = useState<boolean>(false);

  // Confidence & Sensitivity Controls
  const [confidenceThreshold, setConfidenceThreshold] = useState<number>(0.45);
  const [soundAlerts, setSoundAlerts] = useState<boolean>(false);

  // Video Upload States
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [uploadAnalysis, setUploadAnalysis] = useState<any | null>(null);

  // Video & Canvas DOM Elements
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const captureCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Loop & Concurrency State Refs (prevents stale closures and overlapping calls)
  const isCameraActiveRef = useRef<boolean>(false);
  const isProcessingRef = useRef<boolean>(false);
  const loopTimerRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number>(Date.now());
  const selectedRoomRef = useRef<Room | null>(selectedRoom);
  const confidenceThresholdRef = useRef<number>(0.45);
  const soundAlertsRef = useRef<boolean>(false);

  useEffect(() => {
    selectedRoomRef.current = selectedRoom;
  }, [selectedRoom]);

  useEffect(() => {
    confidenceThresholdRef.current = confidenceThreshold;
  }, [confidenceThreshold]);

  useEffect(() => {
    soundAlertsRef.current = soundAlerts;
  }, [soundAlerts]);

  // Check available videoinput devices to detect if multiple cameras exist
  const checkAvailableCameras = useCallback(async () => {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
      return;
    }
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices.filter((d) => d.kind === 'videoinput');
      // If 2+ video devices found, or if user-agent is mobile, enable camera switcher
      const isMobileDevice = /mobile|android|iphone|ipad|tablet/i.test(navigator.userAgent || '');
      setHasMultipleCameras(videoDevices.length > 1 || isMobileDevice);
    } catch (err) {
      console.warn('Could not enumerate cameras:', err);
      // Fallback: on mobile, assume both front and back cameras exist
      const isMobileDevice = /mobile|android|iphone|ipad|tablet/i.test(navigator.userAgent || '');
      setHasMultipleCameras(isMobileDevice);
    }
  }, []);

  useEffect(() => {
    checkAvailableCameras();
  }, [checkAvailableCameras]);

  // Subtle web audio beep for anomaly notification
  const playAlertChime = useCallback(() => {
    if (!soundAlertsRef.current) return;
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, audioCtx.currentTime); // D5
      osc.frequency.exponentialRampToValueAtTime(880, audioCtx.currentTime + 0.15); // A5
      gain.gain.setValueAtTime(0.12, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.25);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.25);
    } catch {
      // AudioContext policy
    }
  }, []);

  // Save current frame as evidence JPEG
  const handleTakeSnapshot = () => {
    if (!videoRef.current) return;
    const canvas = document.createElement('canvas');
    canvas.width = videoRef.current.videoWidth || 640;
    canvas.height = videoRef.current.videoHeight || 480;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);

    if (overlayCanvasRef.current) {
      ctx.drawImage(overlayCanvasRef.current, 0, 0, canvas.width, canvas.height);
    }

    const link = document.createElement('a');
    link.download = `campustwin_evidence_${new Date().toISOString().replace(/[:.]/g, '-')}.jpg`;
    link.href = canvas.toDataURL('image/jpeg', 0.9);
    link.click();
  };

  // Stop camera tracks and cancel pending timer cleanly
  const stopCameraStream = useCallback(() => {
    isCameraActiveRef.current = false;
    isProcessingRef.current = false;

    if (loopTimerRef.current !== null) {
      window.clearTimeout(loopTimerRef.current);
      loopTimerRef.current = null;
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    // Clear overlay canvas
    if (overlayCanvasRef.current) {
      const ctx = overlayCanvasRef.current.getContext('2d');
      if (ctx) ctx.clearRect(0, 0, overlayCanvasRef.current.width, overlayCanvasRef.current.height);
    }

    setIsCameraActive(false);
    setIsProcessing(false);
    api.stopDetection().catch(() => {});
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopCameraStream();
    };
  }, [stopCameraStream]);

  // Draw smooth bounding boxes and confidence labels over video
  const drawOverlayHUD = (detections: any[], frameW: number, frameH: number) => {
    const canvas = overlayCanvasRef.current;
    if (!canvas) return;

    canvas.width = frameW;
    canvas.height = frameH;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    detections.forEach((det, idx) => {
      const [x1, y1, x2, y2] = det.box;
      const bw = x2 - x1;
      const bh = y2 - y1;
      const confPct = Math.round((det.confidence || 0) * 100);
      const trackId = det.track_id ? `#${det.track_id}` : `#${idx + 1}`;

      // Bounding box glow
      ctx.shadowColor = 'rgba(6, 182, 212, 0.9)';
      ctx.shadowBlur = 8;
      ctx.strokeStyle = '#06b6d4';
      ctx.lineWidth = 2.5;
      ctx.strokeRect(x1, y1, bw, bh);

      // Reset shadow for label text
      ctx.shadowBlur = 0;

      // Label background badge
      const label = `Person ${confPct}% ${trackId}`;
      ctx.font = 'bold 12px sans-serif';
      const textWidth = ctx.measureText(label).width;
      const badgeH = 20;
      const badgeY = Math.max(0, y1 - badgeH - 3);

      ctx.fillStyle = 'rgba(11, 15, 25, 0.88)';
      ctx.fillRect(x1, badgeY, textWidth + 12, badgeH);

      ctx.strokeStyle = '#06b6d4';
      ctx.lineWidth = 1;
      ctx.strokeRect(x1, badgeY, textWidth + 12, badgeH);

      ctx.fillStyle = '#38bdf8';
      ctx.fillText(label, x1 + 6, badgeY + 14);
    });
  };

  // Perform single frame capture and detection call
  const captureAndDetect = async () => {
    if (!videoRef.current || !captureCanvasRef.current || !isCameraActiveRef.current) return;

    const video = videoRef.current;
    if (video.videoWidth === 0 || video.videoHeight === 0 || video.paused || video.ended) return;

    // Scale frame down to max width 480px to reduce payload to ~25 KB and achieve 30-50ms YOLO latency
    const maxDim = 480;
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    const scale = Math.min(maxDim / vw, maxDim / vh, 1.0);
    const targetW = Math.round(vw * scale);
    const targetH = Math.round(vh * scale);

    const canvas = captureCanvasRef.current;
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(video, 0, 0, targetW, targetH);
    // JPEG quality 0.6 produces lightweight ~20-30KB base64 string
    const base64Data = canvas.toDataURL('image/jpeg', 0.6);

    try {
      const res = await api.sendDetectionFrame(
        base64Data,
        selectedRoomRef.current?.id,
        confidenceThresholdRef.current
      );
      setLatestResult(res);
      onNewDetection(res);

      if (res.alert) {
        playAlertChime();
      }

      // Draw bounding box HUD onto overlay
      if (res.detections) {
        drawOverlayHUD(res.detections, targetW, targetH);
      }

      // Calculate smooth FPS
      const now = Date.now();
      const delta = (now - lastTimeRef.current) / 1000.0;
      lastTimeRef.current = now;
      if (delta > 0) {
        setFps(Math.round(1 / delta));
      }
      setErrorMessage(null);
    } catch (err: any) {
      console.warn('Frame detection warning:', err);
      // Soft warning, do not halt webcam
      const msg = err?.response?.data?.message || err?.message || 'Frame processing error.';
      setErrorMessage(msg);
    }
  };

  // Schedule next detection loop step (ensures strictly 1 in-flight frame at a time)
  const scheduleLoop = (delayMs: number = 400) => {
    if (!isCameraActiveRef.current) return;
    if (loopTimerRef.current !== null) {
      window.clearTimeout(loopTimerRef.current);
    }
    loopTimerRef.current = window.setTimeout(async () => {
      if (!isCameraActiveRef.current) return;

      if (isProcessingRef.current) {
        scheduleLoop(200);
        return;
      }

      isProcessingRef.current = true;
      setIsProcessing(true);

      try {
        await captureAndDetect();
      } finally {
        isProcessingRef.current = false;
        setIsProcessing(false);
        if (isCameraActiveRef.current) {
          // 400ms pace ensures smooth 2.5 FPS person counting with virtually zero CPU strain
          scheduleLoop(400);
        }
      }
    }, delayMs);
  };

  // Start camera stream (defaults to rear camera "environment" on mobile)
  const startCamera = async (targetFacingMode?: 'environment' | 'user') => {
    setErrorMessage(null);
    const mode = targetFacingMode || facingMode;

    // 1. Stop any running timers to prevent race conditions or duplicate detection loops
    if (loopTimerRef.current !== null) {
      window.clearTimeout(loopTimerRef.current);
      loopTimerRef.current = null;
    }
    isProcessingRef.current = false;
    setIsProcessing(false);

    // 2. Stop old stream tracks before acquiring new hardware device
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    try {
      let stream: MediaStream;
      try {
        // Preferred: Request facingMode ("environment" opens rear camera on phones, falls back to webcam on laptops)
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: mode },
            width: { ideal: 640 },
            height: { ideal: 480 },
            frameRate: { ideal: 30 },
          },
          audio: false,
        });
      } catch (modeErr) {
        // Fallback for browsers or devices that reject facingMode constraints
        console.warn('FacingMode constraint fallback:', modeErr);
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 640 },
            height: { ideal: 480 },
            frameRate: { ideal: 30 },
          },
          audio: false,
        });
      }

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      // Check track settings to verify which camera was opened
      const track = stream.getVideoTracks()[0];
      const settings = track?.getSettings?.();
      if (settings?.facingMode) {
        setFacingMode(settings.facingMode as 'environment' | 'user');
      }

      isCameraActiveRef.current = true;
      setIsCameraActive(true);

      // Re-enumerate cameras now that permission has been granted
      checkAvailableCameras();

      if (selectedRoomRef.current) {
        await api.startDetection(selectedRoomRef.current.id, 'live_webcam').catch(() => {});
      }

      // Kick off sequential frame loop after short camera warm-up (strictly 1 in-flight frame)
      scheduleLoop(300);
    } catch (err: any) {
      console.error('Camera access denied or failed:', err);
      let friendlyMsg = 'Could not access camera. Please grant browser camera permissions or try Video Upload mode.';
      if (err?.name === 'NotAllowedError' || err?.name === 'PermissionDeniedError') {
        friendlyMsg = 'Camera permission was denied. Please allow camera access in your browser settings.';
      } else if (err?.name === 'NotFoundError' || err?.name === 'DevicesNotFoundError') {
        friendlyMsg = 'No camera found on this device.';
      } else if (err?.name === 'NotReadableError' || err?.name === 'TrackStartError') {
        friendlyMsg = 'Camera is currently in use by another application or browser tab.';
      } else if (err?.name === 'OverconstrainedError') {
        friendlyMsg = 'Requested camera resolution/mode is not supported by your device.';
      }
      setErrorMessage(friendlyMsg);
      setIsCameraActive(false);
      isCameraActiveRef.current = false;
    }
  };

  // Switch between Rear (environment) and Front (user) camera without refreshing
  const switchCamera = async () => {
    if (isSwitchingCamera || !isCameraActiveRef.current) return;
    setIsSwitchingCamera(true);
    setErrorMessage(null);

    const nextMode: 'environment' | 'user' = facingMode === 'environment' ? 'user' : 'environment';
    setFacingMode(nextMode);

    try {
      // 1. Cancel pending timer and reset processing flags
      if (loopTimerRef.current !== null) {
        window.clearTimeout(loopTimerRef.current);
        loopTimerRef.current = null;
      }
      isProcessingRef.current = false;
      setIsProcessing(false);

      // 2. Stop old stream tracks immediately
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }

      // 3. Small pause to allow mobile camera hardware sensor to release cleanly
      await new Promise((resolve) => setTimeout(resolve, 200));

      // 4. Start camera with the new facingMode
      await startCamera(nextMode);
    } catch (err) {
      console.error('Failed to switch camera:', err);
      setErrorMessage('Failed to switch camera. Attempting to restart active camera.');
      await startCamera().catch(() => {});
    } finally {
      setIsSwitchingCamera(false);
    }
  };

  // Handle Video Upload
  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadFile) return;

    setIsUploading(true);
    setErrorMessage(null);
    try {
      const formData = new FormData();
      formData.append('file', uploadFile);
      if (selectedRoom) {
        formData.append('room_id', String(selectedRoom.id));
      }

      const res = await api.uploadVideoForAnalysis(formData);
      setUploadAnalysis(res.analysis);
    } catch (err: any) {
      setErrorMessage(err?.response?.data?.message || 'Video analysis failed. Please verify the file format.');
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="space-y-6 animate-fadeIn pb-12">
      {/* Header and Room Selector (Figma Glass Style) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-6 rounded-3xl bg-white/90 backdrop-blur-md border border-white/80 shadow-[0_10px_30px_rgba(15,23,42,0.04)]">
        <div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-widest bg-cyan-50 text-cyan-700 border border-cyan-200 mb-1.5">
            <Camera className="w-3.5 h-3.5 text-cyan-600" /> Computer Vision Hub
          </div>
          <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
            Live AI Person Detection & Monitoring
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5 font-medium">
            YOLOv8n pretrained inference with Euclidean centroid tracking. Target class: <span className="text-cyan-700 font-bold">person (#0)</span>.
          </p>
        </div>

        {/* Room Selection Dropdown */}
        <div className="flex items-center gap-2.5">
          <label className="text-xs font-bold text-slate-600 whitespace-nowrap">
            Target Zone:
          </label>
          <select
            value={selectedRoom?.id || ''}
            onChange={(e) => {
              const r = rooms.find((rm) => rm.id === Number(e.target.value));
              if (r) onSelectRoom(r);
            }}
            className="px-3.5 py-2 rounded-xl text-xs font-bold bg-slate-50 hover:bg-slate-100 text-slate-800 border border-slate-200/90 focus:outline-none focus:ring-2 focus:ring-cyan-500 cursor-pointer shadow-sm"
          >
            {rooms.map((r) => (
              <option key={r.id} value={r.id}>
                {r.building} - {r.room_number} (Cap: {r.capacity})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Mode Toggle Bar: Webcam vs Upload */}
      <div className="flex items-center gap-1.5 p-1 rounded-2xl bg-slate-100/80 border border-slate-200/80 w-fit">
        <button
          onClick={() => {
            stopCameraStream();
            setActiveMode('webcam');
          }}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
            activeMode === 'webcam'
              ? 'bg-white text-slate-900 shadow-sm border border-slate-200'
              : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          <Camera className="w-4 h-4 text-cyan-600" /> Live Camera & Webcam
        </button>
        <button
          onClick={() => {
            stopCameraStream();
            setActiveMode('upload');
          }}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
            activeMode === 'upload'
              ? 'bg-white text-slate-900 shadow-sm border border-slate-200'
              : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          <Upload className="w-4 h-4 text-purple-600" /> Upload Campus Video
        </button>
      </div>

      {/* Error alert banner */}
      {errorMessage && (
        <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-amber-400 flex-shrink-0" />
            <span>{errorMessage}</span>
          </div>
          <button
            onClick={() => setErrorMessage(null)}
            className="text-xs underline hover:text-white"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* WEBCAM MODE */}
      {activeMode === 'webcam' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Live Video Feed Canvas */}
          <div className="lg:col-span-2 space-y-4">
            <div className="relative rounded-2xl bg-black border border-slate-800 overflow-hidden shadow-2xl aspect-video flex items-center justify-center">
              {/* Working Offscreen Canvas for Frame Extraction */}
              <canvas ref={captureCanvasRef} className="hidden" />

              {/* Native Live Video Feed (Plays smoothly at full 30 FPS without stuttering) */}
              <video
                ref={videoRef}
                playsInline
                muted
                autoPlay
                className={`w-full h-full object-contain ${
                  isCameraActive && feedView === 'camera_hud' ? 'block' : 'hidden'
                }`}
              />

              {/* Overlay HUD Canvas for Real-time YOLO Bounding Boxes */}
              <canvas
                ref={overlayCanvasRef}
                className={`absolute inset-0 w-full h-full object-contain pointer-events-none ${
                  isCameraActive && feedView === 'camera_hud' ? 'block' : 'hidden'
                }`}
              />

              {/* Display: Server Annotated Frame Mode */}
              {isCameraActive && feedView === 'server_annotated' && latestResult?.annotated_frame && (
                <img
                  src={latestResult.annotated_frame}
                  alt="Server YOLO Stream"
                  className="w-full h-full object-contain"
                />
              )}

              {/* Camera Standby Placeholder */}
              {!isCameraActive && (
                <div className="flex flex-col items-center justify-center text-slate-500 gap-3 p-6 text-center">
                  <div className="w-16 h-16 rounded-full bg-slate-900 border border-slate-800 flex items-center justify-center text-slate-400 shadow-inner">
                    <Camera className="w-8 h-8" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-white">Camera Standby</h3>
                    <p className="text-xs text-slate-400 mt-1 max-w-sm">
                      Click &quot;Start Live Camera&quot; to initialize your camera (rear camera by default on phones) and stream real-time YOLO person detection.
                    </p>
                  </div>
                </div>
              )}

              {/* Live Overlay HUD Header */}
              {isCameraActive && (
                <div className="absolute top-3 left-3 right-3 flex items-center justify-between pointer-events-none">
                  <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-[11px] font-bold bg-slate-950/85 text-emerald-400 border border-emerald-500/30 backdrop-blur-md shadow-lg">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                    LIVE YOLO ({fps > 0 ? `${fps} FPS` : 'Detecting...'})
                  </div>

                  <div className="flex items-center gap-2 pointer-events-auto">
                    {/* View mode toggle */}
                    <button
                      onClick={() =>
                        setFeedView((v) => (v === 'camera_hud' ? 'server_annotated' : 'camera_hud'))
                      }
                      className="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-slate-950/85 text-cyan-300 border border-cyan-500/30 backdrop-blur-md hover:bg-slate-800 transition flex items-center gap-1.5"
                    >
                      {feedView === 'camera_hud' ? (
                        <>
                          <Eye className="w-3 h-3 text-cyan-400" /> Live HUD View
                        </>
                      ) : (
                        <>
                          <Tv className="w-3 h-3 text-purple-400" /> Server Stream
                        </>
                      )}
                    </button>

                    <div className="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-slate-950/85 text-cyan-300 border border-slate-700 backdrop-blur-md flex items-center gap-1.5">
                      <Camera className="w-3 h-3 text-cyan-400" />
                      <span>{facingMode === 'environment' ? 'Rear Camera' : 'Front Camera'}</span>
                    </div>

                    <div className="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-slate-950/85 text-slate-300 border border-slate-700 backdrop-blur-md">
                      {latestResult?.model_used || 'YOLOv8n'}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Camera Control Bar */}
            <div className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-2xl bg-white/90 backdrop-blur-md border border-white/80 shadow-[0_6px_20px_rgba(15,23,42,0.03)]">
              <div className="flex items-center gap-3">
                {!isCameraActive ? (
                  <button
                    onClick={() => startCamera()}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white shadow-lg shadow-cyan-600/20 transition cursor-pointer"
                  >
                    <Camera className="w-4 h-4" /> Start Live Camera
                  </button>
                ) : (
                  <button
                    onClick={stopCameraStream}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-500 text-white shadow-lg shadow-rose-600/20 transition cursor-pointer"
                  >
                    <CameraOff className="w-4 h-4" /> Stop Camera
                  </button>
                )}

                {isCameraActive && (
                  <button
                    onClick={handleTakeSnapshot}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-200 transition cursor-pointer shadow-sm"
                    title="Download current frame with YOLO annotations as evidence"
                  >
                    <Download className="w-3.5 h-3.5 text-cyan-600" /> Save Evidence
                  </button>
                )}

                {isCameraActive && hasMultipleCameras && (
                  <button
                    onClick={switchCamera}
                    disabled={isSwitchingCamera}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-200 transition cursor-pointer shadow-sm disabled:opacity-50"
                    title={`Switch to ${facingMode === 'environment' ? 'Front (Selfie)' : 'Rear (Back)'} Camera`}
                  >
                    <SwitchCamera className={`w-3.5 h-3.5 text-indigo-600 ${isSwitchingCamera ? 'animate-spin' : ''}`} />
                    <span>{facingMode === 'environment' ? 'Switch to Front' : 'Switch to Rear'}</span>
                  </button>
                )}

                {isCameraActive && isProcessing && (
                  <div className="flex items-center gap-1.5 text-xs text-cyan-700 font-bold">
                    <Activity className="w-3.5 h-3.5 animate-spin text-cyan-600" />
                    <span>Inference active</span>
                  </div>
                )}
              </div>

              <div className="text-xs text-slate-500 font-medium">
                Active Room Target:{' '}
                <span className="font-bold text-slate-900">
                  {selectedRoom ? `${selectedRoom.building} - ${selectedRoom.room_number}` : 'None'}
                </span>
              </div>
            </div>
          </div>

          {/* Right Live Statistics & Metrics HUD */}
          <div className="space-y-4">
            {/* Live Person Count Large Card */}
            <div className="p-6 rounded-3xl bg-white/90 backdrop-blur-md border border-white/80 shadow-[0_10px_30px_rgba(15,23,42,0.04)] text-center relative overflow-hidden">
              <span className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                Live Person Count
              </span>
              <div className="text-6xl font-black text-slate-900 tracking-tight my-2">
                {latestResult?.person_count ?? 0}
              </div>
              <p className="text-xs text-slate-400 font-medium">
                People detected in current frame
              </p>

              {/* Occupancy Percentage Bar */}
              {selectedRoom && (
                <div className="mt-5 pt-4 border-t border-slate-100 space-y-2">
                  <div className="flex items-center justify-between text-xs font-bold">
                    <span className="text-slate-600">Room Occupancy</span>
                    <span className="text-cyan-700">
                      {latestResult ? latestResult.occupancy_percentage : selectedRoom.occupancy_percentage}%
                    </span>
                  </div>
                  <div className="w-full h-2 rounded-full bg-slate-100 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-blue-500 transition-all duration-300"
                      style={{
                        width: `${Math.min(
                          100,
                          latestResult ? latestResult.occupancy_percentage || 0 : selectedRoom.occupancy_percentage
                        )}%`,
                      }}
                    />
                  </div>
                  <div className="text-[11px] text-slate-400 text-left font-medium">
                    Capacity: {selectedRoom.capacity} seats | Free:{' '}
                    {Math.max(0, selectedRoom.capacity - (latestResult?.person_count ?? selectedRoom.current_occupancy))}
                  </div>
                </div>
              )}
            </div>

            {/* Model Confidence & Telemetry Card */}
            <div className="p-6 rounded-3xl bg-white/90 backdrop-blur-md border border-white/80 shadow-[0_10px_30px_rgba(15,23,42,0.04)] space-y-3">
              <div className="flex items-center gap-2 text-xs font-extrabold text-slate-900 uppercase tracking-wider">
                <Sparkles className="w-4 h-4 text-cyan-600" /> Detection Telemetry
              </div>

              <div className="space-y-2.5 text-xs font-semibold">
                <div className="flex items-center justify-between py-1.5 border-b border-slate-100">
                  <span className="text-slate-500">Vision Architecture</span>
                  <span className="font-extrabold text-slate-900">{latestResult?.model_used || 'YOLOv8n'}</span>
                </div>
                <div className="flex items-center justify-between py-1.5 border-b border-slate-100">
                  <span className="text-slate-500">Average Confidence</span>
                  <span className="font-extrabold text-emerald-600">
                    {latestResult ? `${Math.round(latestResult.confidence_avg * 100)}%` : '—'}
                  </span>
                </div>
                <div className="flex items-center justify-between py-1.5 border-b border-slate-100">
                  <span className="text-slate-500">COCO Class Filter</span>
                  <span className="font-extrabold text-cyan-700">person (0)</span>
                </div>
                <div className="flex items-center justify-between py-1.5 border-b border-slate-100">
                  <span className="text-slate-500">Centroid Tracker</span>
                  <span className="font-extrabold text-purple-600">Isolated per Room</span>
                </div>
                <div className="flex items-center justify-between py-1.5 border-b border-slate-100">
                  <span className="text-slate-500">Cumulative Unique Tracks</span>
                  <span className="font-extrabold text-indigo-700">
                    {latestResult?.cumulative_unique_tracks || 0} unique IDs
                  </span>
                </div>
                <div className="flex items-center justify-between py-1.5">
                  <span className="text-slate-500">Privacy Safeguard</span>
                  <span className="font-extrabold text-slate-700">No Biometric Identity Stored</span>
                </div>
              </div>
            </div>

            {/* Interactive Detection Controls Card */}
            <div className="p-6 rounded-3xl bg-white/90 backdrop-blur-md border border-white/80 shadow-[0_10px_30px_rgba(15,23,42,0.04)] space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-extrabold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                  <Sliders className="w-4 h-4 text-cyan-600" /> YOLO Confidence Threshold
                </span>
                <span className="text-xs font-mono font-extrabold text-cyan-700 px-2.5 py-0.5 rounded-full bg-cyan-50 border border-cyan-200">
                  {Math.round(confidenceThreshold * 100)}%
                </span>
              </div>

              <input
                type="range"
                min="0.20"
                max="0.85"
                step="0.05"
                value={confidenceThreshold}
                onChange={(e) => {
                  const val = parseFloat(e.target.value);
                  setConfidenceThreshold(val);
                }}
                className="w-full accent-cyan-600 cursor-pointer"
              />

              <div className="flex justify-between text-[10px] text-slate-400 font-bold">
                <span>20% (High Recall)</span>
                <span>45% (Balanced)</span>
                <span>85% (Strict)</span>
              </div>

              {/* Sound & Alert notification toggles */}
              <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                <span className="text-slate-600 font-bold flex items-center gap-1.5">
                  {soundAlerts ? <Volume2 className="w-3.5 h-3.5 text-cyan-600" /> : <VolumeX className="w-3.5 h-3.5 text-slate-400" />}
                  Audio Anomaly Alarm
                </span>
                <button
                  onClick={() => setSoundAlerts((s) => !s)}
                  className={`px-3 py-1 rounded-full text-[11px] font-bold transition cursor-pointer ${
                    soundAlerts ? 'bg-cyan-50 text-cyan-700 border border-cyan-200' : 'bg-slate-100 text-slate-500 hover:text-slate-800'
                  }`}
                >
                  {soundAlerts ? 'Enabled' : 'Muted'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* UPLOAD VIDEO MODE */}
      {activeMode === 'upload' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Upload Dropzone Form */}
          <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 shadow-xl space-y-5">
            <div>
              <h2 className="text-base font-bold text-white tracking-tight">
                Upload Recorded Campus Video File
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                Upload MP4, AVI, or WebM clips of classroom, library, or hallway footage.
              </p>
            </div>

            <form onSubmit={handleUploadSubmit} className="space-y-4">
              <div className="border-2 border-dashed border-slate-700 hover:border-cyan-500 rounded-2xl p-8 text-center cursor-pointer transition bg-slate-950/40">
                <input
                  type="file"
                  accept="video/mp4,video/avi,video/webm,video/mkv"
                  onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                  className="hidden"
                  id="video-upload-input"
                />
                <label htmlFor="video-upload-input" className="cursor-pointer block">
                  <Upload className="w-10 h-10 text-cyan-400 mx-auto mb-2" />
                  <span className="text-xs font-bold text-white block">
                    {uploadFile ? uploadFile.name : 'Choose a video file or drag here'}
                  </span>
                  <span className="text-[11px] text-slate-500 block mt-1">
                    Max size 50 MB (MP4, AVI, WebM)
                  </span>
                </label>
              </div>

              <button
                type="submit"
                disabled={!uploadFile || isUploading}
                className="w-full py-3 rounded-xl text-xs font-bold bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white shadow-lg shadow-cyan-500/20 transition disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
              >
                {isUploading ? (
                  <>
                    <Activity className="w-4 h-4 animate-spin" />
                    <span>Analyzing Frames with YOLO...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Analyze Video Footage</span>
                  </>
                )}
              </button>
            </form>
          </div>

          {/* Analysis Results Display */}
          <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 shadow-xl">
            <h2 className="text-base font-bold text-white tracking-tight mb-4">
              Video Analysis Summary
            </h2>

            {uploadAnalysis ? (
              <div className="space-y-4 animate-fadeIn">
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-4 rounded-xl bg-slate-800/60 border border-slate-700">
                    <span className="text-[11px] text-slate-400 font-semibold block">Peak Occupancy</span>
                    <span className="text-2xl font-black text-white">{uploadAnalysis.peak_people_count} people</span>
                  </div>
                  <div className="p-4 rounded-xl bg-slate-800/60 border border-slate-700">
                    <span className="text-[11px] text-slate-400 font-semibold block">Average Occupancy</span>
                    <span className="text-2xl font-black text-cyan-300">{uploadAnalysis.average_people_count} people</span>
                  </div>
                  <div className="p-4 rounded-xl bg-slate-800/60 border border-slate-700">
                    <span className="text-[11px] text-slate-400 font-semibold block">Unique People Estimate</span>
                    <span className="text-2xl font-black text-purple-300">{uploadAnalysis.estimated_unique_people}</span>
                  </div>
                  <div className="p-4 rounded-xl bg-slate-800/60 border border-slate-700">
                    <span className="text-[11px] text-slate-400 font-semibold block">Duration Sampled</span>
                    <span className="text-2xl font-black text-slate-300">{uploadAnalysis.video_duration_seconds}s</span>
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-800 text-xs text-slate-400">
                  Model: <span className="font-semibold text-white">{uploadAnalysis.model_used}</span> | Total Frames Analyzed:{' '}
                  <span className="font-semibold text-white">{uploadAnalysis.total_frames_analyzed}</span>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-16 text-center text-slate-500 gap-2">
                <Layers className="w-8 h-8 text-slate-600" />
                <p className="text-xs">No video analyzed yet. Upload a clip to inspect timeline person counts.</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
