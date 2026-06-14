import React, { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";

import type { CameraOverlayState } from "../../hooks/useWhiteboardRecording";
import styles from "./index.module.less";

interface CameraOverlayProps {
  camera: CameraOverlayState;
  onClose: () => void;
}

const clamp = (value: number, min: number, max: number) => {
  return Math.min(Math.max(value, min), max);
};

const CameraOverlay: React.FC<CameraOverlayProps> = ({ camera, onClose }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const dragStateRef = useRef<{
    mode: "move" | "resize";
    startX: number;
    startY: number;
    startLeft: number;
    startTop: number;
    startSize: number;
  } | null>(null);
  const [position, setPosition] = useState({ left: 0, top: 0, size: 168 });

  useEffect(() => {
    const size = 168;
    setPosition({
      left: Math.max(24, window.innerWidth - size - 32),
      top: Math.max(24, window.innerHeight - size - 32),
      size,
    });
  }, []);

  useEffect(() => {
    if (!videoRef.current) return;
    videoRef.current.srcObject = camera.stream;
  }, [camera.stream]);

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      const dragState = dragStateRef.current;
      if (!dragState) return;

      const deltaX = event.clientX - dragState.startX;
      const deltaY = event.clientY - dragState.startY;
      if (dragState.mode === "resize") {
        const nextSize = clamp(
          dragState.startSize + Math.max(deltaX, deltaY),
          112,
          280,
        );
        setPosition((current) => ({
          ...current,
          size: nextSize,
          left: clamp(current.left, 16, window.innerWidth - nextSize - 16),
          top: clamp(current.top, 16, window.innerHeight - nextSize - 16),
        }));
        return;
      }

      setPosition((current) => ({
        ...current,
        left: clamp(
          dragState.startLeft + deltaX,
          16,
          window.innerWidth - current.size - 16,
        ),
        top: clamp(
          dragState.startTop + deltaY,
          16,
          window.innerHeight - current.size - 16,
        ),
      }));
    };

    const handlePointerUp = () => {
      dragStateRef.current = null;
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, []);

  const startDrag = (
    event: React.PointerEvent<HTMLDivElement>,
    mode: "move" | "resize",
  ) => {
    event.preventDefault();
    event.stopPropagation();
    dragStateRef.current = {
      mode,
      startX: event.clientX,
      startY: event.clientY,
      startLeft: position.left,
      startTop: position.top,
      startSize: position.size,
    };
  };

  return (
    <div
      className={styles.cameraOverlay}
      style={{
        width: position.size,
        height: position.size,
        left: position.left,
        top: position.top,
      }}
      onPointerDown={(event) => startDrag(event, "move")}
    >
      <video
        ref={videoRef}
        className={styles.video}
        muted
        autoPlay
        playsInline
      />
      <button
        type="button"
        className={styles.closeButton}
        title="关闭摄像头"
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => {
          event.stopPropagation();
          onClose();
        }}
      >
        <X size={14} />
      </button>
      <div
        className={styles.resizeHandle}
        title="调整大小"
        onPointerDown={(event) => startDrag(event, "resize")}
      />
    </div>
  );
};

export default CameraOverlay;
