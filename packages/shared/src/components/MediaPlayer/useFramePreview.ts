import { useCallback, useEffect, useRef } from "react";

const PREVIEW_WIDTH = 160;

/**
 * 进度条帧预览：首次请求时才创建一个离屏 video 解码同一地址，
 * seek 到目标时刻后把画面画进 canvasRef。任一时刻只有一次 seek 在途，
 * 期间的请求只保留最新一次，拖得再快也不会堆积解码。
 * 跨域且无 CORS 的源画进 canvas 只会污染画布（不可读像素），不影响显示。
 */
export function useFramePreview(src: string | undefined, crossOrigin?: string) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const probeRef = useRef<HTMLVideoElement | null>(null);
  const pendingTimeRef = useRef<number | null>(null);
  const seekingRef = useRef(false);

  const draw = useCallback(() => {
    const probe = probeRef.current;
    const canvas = canvasRef.current;
    if (!probe || !canvas || !probe.videoWidth || !probe.videoHeight) {
      return;
    }
    const scale = window.devicePixelRatio || 1;
    canvas.width = Math.round(PREVIEW_WIDTH * scale);
    canvas.height = Math.round(((PREVIEW_WIDTH * probe.videoHeight) / probe.videoWidth) * scale);
    try {
      canvas.getContext("2d")?.drawImage(probe, 0, 0, canvas.width, canvas.height);
    } catch {
      // 解码尚未就绪等瞬时错误：保留上一帧即可
    }
  }, []);

  const seekToPending = useCallback(() => {
    const probe = probeRef.current;
    const time = pendingTimeRef.current;
    if (!probe || time == null || probe.readyState < HTMLMediaElement.HAVE_METADATA) {
      return;
    }
    pendingTimeRef.current = null;
    seekingRef.current = true;
    probe.currentTime = time;
  }, []);

  useEffect(() => {
    return () => {
      const probe = probeRef.current;
      if (probe) {
        probe.removeAttribute("src");
        probe.load();
      }
      probeRef.current = null;
      pendingTimeRef.current = null;
      seekingRef.current = false;
    };
  }, [src, crossOrigin]);

  const request = useCallback(
    (time: number) => {
      if (!src || !Number.isFinite(time)) {
        return;
      }
      let probe = probeRef.current;
      if (!probe) {
        probe = document.createElement("video");
        probe.muted = true;
        probe.preload = "auto";
        probe.playsInline = true;
        if (crossOrigin) {
          probe.crossOrigin = crossOrigin;
        }
        probe.addEventListener("loadedmetadata", seekToPending);
        probe.addEventListener("seeked", () => {
          seekingRef.current = false;
          draw();
          seekToPending();
        });
        probe.src = src;
        probeRef.current = probe;
      }
      pendingTimeRef.current = time;
      if (!seekingRef.current) {
        seekToPending();
      }
    },
    [crossOrigin, draw, seekToPending, src]
  );

  return { canvasRef, request, previewWidth: PREVIEW_WIDTH };
}
