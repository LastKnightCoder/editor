import React, { useEffect, useRef, useState } from "react";

import type { CameraOverlayState } from "../../hooks/useWhiteboardRecording";
import styles from "./index.module.less";

interface CameraOverlayProps {
  camera: CameraOverlayState;
}

const clamp = (value: number, min: number, max: number) => {
  return Math.min(Math.max(value, min), max);
};

const MIN_CAMERA_SIZE = 112;
const MAX_CAMERA_SIZE = 280;
const RESIZE_EDGE_WIDTH = 14;

const CameraOverlay: React.FC<CameraOverlayProps> = ({ camera }) => {
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
  const [isHoveringResizeEdge, setIsHoveringResizeEdge] = useState(false);

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
        const startCenterX = dragState.startLeft + dragState.startSize / 2;
        const startCenterY = dragState.startTop + dragState.startSize / 2;
        const nextSize = clamp(
          Math.hypot(
            event.clientX - startCenterX,
            event.clientY - startCenterY,
          ) * 2,
          MIN_CAMERA_SIZE,
          MAX_CAMERA_SIZE,
        );
        setPosition({
          size: nextSize,
          left: clamp(
            startCenterX - nextSize / 2,
            16,
            window.innerWidth - nextSize - 16,
          ),
          top: clamp(
            startCenterY - nextSize / 2,
            16,
            window.innerHeight - nextSize - 16,
          ),
        });
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

  const isOnResizeEdge = (clientX: number, clientY: number) => {
    const centerX = position.left + position.size / 2;
    const centerY = position.top + position.size / 2;
    const distanceFromCenter = Math.hypot(clientX - centerX, clientY - centerY);
    const distanceFromEdge = Math.abs(distanceFromCenter - position.size / 2);
    return distanceFromEdge <= RESIZE_EDGE_WIDTH;
  };

  const startDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    dragStateRef.current = {
      mode: isOnResizeEdge(event.clientX, event.clientY) ? "resize" : "move",
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
      data-resize-edge={isHoveringResizeEdge ? "true" : undefined}
      onPointerDown={startDrag}
      onPointerMove={(event) => {
        if (dragStateRef.current) return;
        setIsHoveringResizeEdge(isOnResizeEdge(event.clientX, event.clientY));
      }}
      onPointerLeave={() => {
        if (dragStateRef.current) return;
        setIsHoveringResizeEdge(false);
      }}
    >
      <video
        ref={videoRef}
        className={styles.video}
        muted
        autoPlay
        playsInline
      />
    </div>
  );
};

export default CameraOverlay;
