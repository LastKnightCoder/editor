import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { Camera, Circle, FolderOpen, Mic, Pause, Play, Square, X } from "lucide-react";

import { showInFolder } from "@/commands";
import {
  closeWhiteboardRecordingControls,
  moveWhiteboardRecordingControls,
  onWhiteboardRecordingControlState,
  offWhiteboardRecordingControlState,
  sendWhiteboardRecordingControlCommand,
  resizeWhiteboardRecordingControls,
  type WhiteboardRecordingControlState,
} from "@/commands/whiteboard-recording";
import useSettingStore from "@/stores/useSettingStore";

const initialState: WhiteboardRecordingControlState = {
  status: "idle",
  elapsedMs: 0,
  outputFormat: "webm",
  microphoneEnabled: true,
  cameraEnabled: false,
  cameraAvailable: true,
  sourceType: "window",
};

const formatDuration = (elapsedMs: number) => {
  const totalSeconds = Math.floor(elapsedMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (value: number) => `${value}`.padStart(2, "0");
  return hours > 0
    ? `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`
    : `${pad(minutes)}:${pad(seconds)}`;
};

const pageClass =
  "fixed inset-0 box-border flex items-center justify-center overflow-hidden bg-transparent p-0 select-none";
const shellClass =
  "flex w-max max-w-none shrink-0 flex-nowrap items-center overflow-hidden rounded-[18px] border border-zinc-200/80 bg-[oklch(98%_0.006_260_/_0.98)] px-3 py-2 text-[13px] text-[oklch(20%_0.012_260)] shadow-[0_8px_18px_oklch(24%_0.012_260_/_0.12)] dark:border-white/10 dark:bg-[oklch(18%_0.01_260_/_0.94)] dark:text-[oklch(96%_0.008_260)] dark:shadow-[0_8px_18px_oklch(12%_0.01_260_/_0.22)]";
const statusPillBase =
  "flex shrink-0 items-center gap-1.5 rounded-full bg-zinc-100/90 px-2 py-1 dark:bg-white/5";
const statusDotBase = "h-1.5 w-1.5 rounded-full bg-zinc-400";
const segmentBase =
  "relative inline-flex shrink-0 items-center gap-1 overflow-hidden rounded-full bg-zinc-100/80 p-0.5 dark:bg-white/5";
const sourceHighlightBase =
  "pointer-events-none absolute inset-y-0.5 left-0.5 w-16 rounded-full bg-zinc-900 shadow-sm transition-transform duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] will-change-transform dark:bg-white";
const sourceButtonBase =
  "relative z-10 inline-flex h-8 w-16 shrink-0 items-center justify-center whitespace-nowrap rounded-full px-2.5 text-[12px] font-medium text-zinc-700 transition-colors duration-150 hover:bg-zinc-200/70 hover:text-zinc-950 disabled:cursor-not-allowed disabled:opacity-40 dark:text-zinc-300 dark:hover:bg-white/10 dark:hover:text-white";
const sourceButtonSelected =
  "!text-white hover:!bg-transparent hover:!text-white dark:!text-zinc-900 dark:hover:!text-zinc-900";
const iconButtonBase =
  "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-zinc-800 transition-colors duration-150 hover:bg-zinc-200/70 hover:text-zinc-950 disabled:cursor-not-allowed disabled:opacity-40 dark:text-zinc-300 dark:hover:bg-white/10 dark:hover:text-white";
const iconButtonActive =
  "!bg-zinc-900 !text-white shadow-sm hover:!bg-zinc-900 dark:!bg-white dark:!text-zinc-900 dark:hover:!bg-white";
const tertiaryButtonBase =
  "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-zinc-200/80 bg-white/70 text-zinc-700 transition-colors duration-150 hover:bg-zinc-200/80 hover:text-zinc-950 disabled:cursor-not-allowed disabled:opacity-40 dark:border-white/10 dark:bg-white/5 dark:text-zinc-400 dark:hover:bg-white/10 dark:hover:text-white";
const primaryButtonBase =
  "inline-flex h-10 min-w-[120px] shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-full bg-zinc-900 px-4 text-[13px] font-semibold text-white shadow-sm transition duration-150 hover:bg-zinc-800 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-100";
const stopButtonBase =
  "inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-red-200/80 bg-red-50 text-red-600 transition-colors duration-150 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-300 dark:hover:bg-red-500/20";
const closeButtonBase =
  "inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-zinc-200/80 bg-white/70 text-zinc-500 transition-colors duration-150 hover:bg-zinc-200/80 hover:text-zinc-900 dark:border-white/10 dark:bg-white/5 dark:text-zinc-400 dark:hover:bg-white/10 dark:hover:text-white";

interface DragState {
  pointerId: number;
  startPointerX: number;
  startPointerY: number;
  startWindowX: number;
  startWindowY: number;
  nextX: number;
  nextY: number;
  rafId: number | null;
}

const WhiteboardRecordingControls = () => {
  const [state, setState] = useState<WhiteboardRecordingControlState>(initialState);
  const isDark = useSettingStore(store => store.setting.darkMode);
  const measureRef = useRef<HTMLDivElement | null>(null);
  const shellRef = useRef<HTMLDivElement | null>(null);
  const lastSizeRef = useRef<{ width: number; height: number } | null>(null);
  const dragStateRef = useRef<DragState | null>(null);

  const isBusy = state.status === "saving";
  const isActive = state.status === "recording" || state.status === "paused";
  const canAdjustSource = !isActive && !isBusy;
  const canAdjustMedia = !isActive && !isBusy;
  const mainAction = useMemo(() => {
    if (state.status === "recording") {
      return {
        label: "停止并保存",
        icon: <Square size={15} fill="currentColor" />,
        onClick: () => sendWhiteboardRecordingControlCommand({ type: "stop" }),
      };
    }
    if (state.status === "paused") {
      return {
        label: "继续",
        icon: <Play size={16} />,
        onClick: () => sendWhiteboardRecordingControlCommand({ type: "resume" }),
      };
    }
    return {
      label: state.status === "completed" ? "重新录制" : "开始录制",
      icon: <Circle size={14} fill="currentColor" />,
      onClick: () => sendWhiteboardRecordingControlCommand({ type: "start" }),
    };
  }, [state.status]);

  useEffect(() => {
    const listener = (_event: unknown, nextState: WhiteboardRecordingControlState) => {
      setState(nextState);
    };
    onWhiteboardRecordingControlState(listener);
    sendWhiteboardRecordingControlCommand({ type: "ready" });
    return () => {
      offWhiteboardRecordingControlState(listener);
    };
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    const body = document.body;
    const appRoot = document.getElementById("root");
    const styleId = "whiteboard-recording-controls-reset";
    let injectedStyle = document.getElementById(styleId);
    if (!injectedStyle) {
      injectedStyle = document.createElement("style");
      injectedStyle.id = styleId;
      injectedStyle.textContent = `
        html, body, #root {
          width: 100% !important;
          height: 100% !important;
          margin: 0 !important;
          overflow: hidden !important;
          background: transparent !important;
          user-select: none !important;
        }
        body {
          display: block !important;
        }
      `;
      document.head.appendChild(injectedStyle);
    }
    const previous = {
      rootOverflow: root.style.overflow,
      rootBackground: root.style.background,
      rootUserSelect: root.style.userSelect,
      bodyOverflow: body.style.overflow,
      bodyBackground: body.style.background,
      bodyMargin: body.style.margin,
      bodyUserSelect: body.style.userSelect,
      appRootOverflow: appRoot?.style.overflow,
      appRootBackground: appRoot?.style.background,
      appRootUserSelect: appRoot?.style.userSelect,
    };

    root.style.overflow = "hidden";
    root.style.background = "transparent";
    root.style.userSelect = "none";
    body.style.overflow = "hidden";
    body.style.background = "transparent";
    body.style.margin = "0";
    body.style.userSelect = "none";
    if (appRoot) {
      appRoot.style.overflow = "hidden";
      appRoot.style.background = "transparent";
      appRoot.style.userSelect = "none";
    }

    return () => {
      root.style.overflow = previous.rootOverflow;
      root.style.background = previous.rootBackground;
      root.style.userSelect = previous.rootUserSelect || "";
      body.style.overflow = previous.bodyOverflow;
      body.style.background = previous.bodyBackground;
      body.style.margin = previous.bodyMargin;
      body.style.userSelect = previous.bodyUserSelect || "";
      if (appRoot) {
        appRoot.style.overflow = previous.appRootOverflow || "";
        appRoot.style.background = previous.appRootBackground || "";
        appRoot.style.userSelect = previous.appRootUserSelect || "";
      }
      injectedStyle?.remove();
    };
  }, []);

  useLayoutEffect(() => {
    const target = measureRef.current;
    if (!target) {
      return;
    }

    const reportSize = () => {
      const measureRect = target.getBoundingClientRect();
      const shell = shellRef.current;
      const shellRect = shell?.getBoundingClientRect();
      const nextWidth = Math.ceil(
        Math.max(measureRect.width, target.scrollWidth, shellRect?.width ?? 0)
      );
      const nextHeight = Math.ceil(
        Math.max(measureRect.height, target.scrollHeight, shellRect?.height ?? 0)
      );
      if (!nextWidth || !nextHeight) {
        return;
      }

      console.info("[WhiteboardRecordingControls] measure", {
        measure: {
          width: measureRect.width,
          height: measureRect.height,
          scrollWidth: target.scrollWidth,
          scrollHeight: target.scrollHeight,
        },
        shell: shellRect
          ? {
              width: shellRect.width,
              height: shellRect.height,
              scrollWidth: shell?.scrollWidth ?? 0,
              scrollHeight: shell?.scrollHeight ?? 0,
            }
          : null,
        window: {
          innerWidth: window.innerWidth,
          innerHeight: window.innerHeight,
          devicePixelRatio: window.devicePixelRatio,
        },
        next: {
          width: nextWidth,
          height: nextHeight,
        },
      });

      const previousSize = lastSizeRef.current;
      if (previousSize && previousSize.width === nextWidth && previousSize.height === nextHeight) {
        return;
      }

      lastSizeRef.current = {
        width: nextWidth,
        height: nextHeight,
      };
      resizeWhiteboardRecordingControls({
        width: nextWidth,
        height: nextHeight,
      }).catch(() => {
        // 窗口尺寸同步失败时保持现状即可。
      });
    };

    const rafId = window.requestAnimationFrame(reportSize);
    const observer = new ResizeObserver(() => {
      window.requestAnimationFrame(reportSize);
    });
    observer.observe(target);

    return () => {
      window.cancelAnimationFrame(rafId);
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    return () => {
      const dragState = dragStateRef.current;
      if (dragState && dragState.rafId !== null) {
        window.cancelAnimationFrame(dragState.rafId);
      }
      dragStateRef.current = null;
    };
  }, []);

  const handleClose = () => {
    sendWhiteboardRecordingControlCommand({ type: "close-controls" });
    closeWhiteboardRecordingControls();
  };

  const handleOpenFolder = () => {
    if (!state.outputPath) return;
    showInFolder(state.outputPath);
  };

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) {
      return;
    }

    const target = event.target as HTMLElement | null;
    if (
      target?.closest(
        "button,a,input,textarea,select,[role='button'],[data-recording-controls-no-drag='true']"
      )
    ) {
      return;
    }

    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragStateRef.current = {
      pointerId: event.pointerId,
      startPointerX: event.screenX,
      startPointerY: event.screenY,
      startWindowX: window.screenX,
      startWindowY: window.screenY,
      nextX: window.screenX,
      nextY: window.screenY,
      rafId: null,
    };
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const dragState = dragStateRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId) {
      return;
    }

    dragState.nextX = dragState.startWindowX + event.screenX - dragState.startPointerX;
    dragState.nextY = dragState.startWindowY + event.screenY - dragState.startPointerY;

    if (dragState.rafId !== null) {
      return;
    }

    dragState.rafId = window.requestAnimationFrame(() => {
      const currentDragState = dragStateRef.current;
      if (!currentDragState) {
        return;
      }

      currentDragState.rafId = null;
      moveWhiteboardRecordingControls({
        x: currentDragState.nextX,
        y: currentDragState.nextY,
      }).catch(() => {
        // 拖拽同步失败时保持当前位置即可。
      });
    });
  };

  const endDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    const dragState = dragStateRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId) {
      return;
    }

    if (dragState.rafId !== null) {
      window.cancelAnimationFrame(dragState.rafId);
      moveWhiteboardRecordingControls({
        x: dragState.nextX,
        y: dragState.nextY,
      }).catch(() => {
        // 拖拽同步失败时保持当前位置即可。
      });
    }

    dragStateRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const statusToneClass = (() => {
    switch (state.status) {
      case "recording":
        return "bg-status-success";
      case "paused":
        return "bg-status-warning";
      case "saving":
        return "bg-status-info";
      case "completed":
        return "bg-status-success";
      case "error":
        return "bg-status-error";
      default:
        return "bg-zinc-400";
    }
  })();

  return (
    <div className={pageClass} data-theme={isDark ? "dark" : "light"}>
      <div
        ref={measureRef}
        className="inline-block w-max max-w-none shrink-0 text-left"
        data-testid="whiteboard-recording-controls-measure"
      >
        <div
          ref={shellRef}
          className={shellClass}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          data-testid="whiteboard-recording-controls-shell"
        >
          <div className="flex shrink-0 flex-nowrap items-center gap-1.5">
            <div className={statusPillBase}>
              <span className={`${statusDotBase} ${statusToneClass}`} />
              <span className="whitespace-nowrap font-mono text-[13px] font-semibold tabular-nums leading-4">
                {formatDuration(state.elapsedMs)}
              </span>
              <span className="shrink-0 rounded-full bg-white/70 px-2 py-0.5 text-[11px] font-medium leading-4 text-zinc-500 dark:bg-white/10 dark:text-zinc-300">
                {state.outputFormat.toUpperCase()}
              </span>
            </div>

            <div className={segmentBase} data-recording-controls-no-drag="true">
              <span
                className={`${sourceHighlightBase} ${
                  state.sourceType === "screen" ? "translate-x-[68px]" : "translate-x-0"
                }`}
              />
              <button
                type="button"
                title="录制当前应用窗口"
                aria-pressed={state.sourceType === "window"}
                className={`${sourceButtonBase} ${
                  state.sourceType === "window" ? sourceButtonSelected : ""
                }`}
                disabled={!canAdjustSource}
                onClick={() =>
                  sendWhiteboardRecordingControlCommand({
                    type: "set-source-type",
                    sourceType: "window",
                  })
                }
              >
                窗口
              </button>
              <button
                type="button"
                title="录制当前屏幕"
                aria-pressed={state.sourceType === "screen"}
                className={`${sourceButtonBase} ${
                  state.sourceType === "screen" ? sourceButtonSelected : ""
                }`}
                disabled={!canAdjustSource}
                onClick={() =>
                  sendWhiteboardRecordingControlCommand({
                    type: "set-source-type",
                    sourceType: "screen",
                  })
                }
              >
                屏幕
              </button>
            </div>

            <div className="flex items-center gap-1.5" data-recording-controls-no-drag="true">
              <button
                type="button"
                title="录制麦克风"
                className={`${iconButtonBase} ${state.microphoneEnabled ? iconButtonActive : ""}`}
                disabled={!canAdjustMedia}
                onClick={() =>
                  sendWhiteboardRecordingControlCommand({
                    type: "toggle-microphone",
                    enabled: !state.microphoneEnabled,
                  })
                }
              >
                <Mic size={16} />
              </button>
              <button
                type="button"
                title={state.cameraAvailable ? "摄像头画中画" : "摄像头不可用"}
                className={`${iconButtonBase} ${state.cameraEnabled ? iconButtonActive : ""}`}
                disabled={!canAdjustMedia || !state.cameraAvailable}
                onClick={() =>
                  sendWhiteboardRecordingControlCommand({
                    type: "toggle-camera",
                    enabled: !state.cameraEnabled,
                  })
                }
              >
                <Camera size={16} />
              </button>
            </div>

            {state.status === "completed" && state.outputPath ? (
              <button
                type="button"
                className={tertiaryButtonBase}
                onClick={handleOpenFolder}
                title="在文件夹中显示"
              >
                <FolderOpen size={16} />
              </button>
            ) : null}

            {state.status === "recording" ? (
              <button
                type="button"
                className={tertiaryButtonBase}
                title="暂停录制"
                onClick={() => sendWhiteboardRecordingControlCommand({ type: "pause" })}
              >
                <Pause size={16} />
              </button>
            ) : null}

            <button
              type="button"
              className={primaryButtonBase}
              onClick={mainAction.onClick}
              disabled={isBusy}
            >
              {mainAction.icon}
              <span>{mainAction.label}</span>
            </button>

            {state.status === "paused" ? (
              <button
                type="button"
                className={stopButtonBase}
                title="停止并保存"
                disabled={isBusy}
                onClick={() => sendWhiteboardRecordingControlCommand({ type: "stop" })}
              >
                <Square size={15} fill="currentColor" />
              </button>
            ) : null}

            <button
              type="button"
              className={closeButtonBase}
              title="关闭工具条"
              onClick={handleClose}
            >
              <X size={16} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default WhiteboardRecordingControls;
