import { useEffect, useMemo, useRef, useState } from "react";
import { useMemoizedFn } from "ahooks";

import {
  closeWhiteboardRecordingControls,
  offWhiteboardRecordingControlCommand,
  onWhiteboardRecordingControlCommand,
  openWhiteboardRecordingControls,
  prepareWhiteboardRecordingCaptureSource,
  publishWhiteboardRecordingControlState,
  saveWhiteboardRecording,
  type WhiteboardRecordingControlState,
  type WhiteboardRecordingCommand,
  type WhiteboardRecordingSourceType,
} from "@/commands/whiteboard-recording";
import type { ISetting } from "@/stores/useSettingStore";

interface UseWhiteboardRecordingOptions {
  setting: ISetting["whiteboardRecording"];
  onSaved?: (outputPath: string) => void;
  onError?: (message: string) => void;
}

export interface CameraOverlayState {
  stream: MediaStream;
  enabled: boolean;
}

const createInitialState = (
  setting: ISetting["whiteboardRecording"],
): WhiteboardRecordingControlState => ({
  status: "idle",
  elapsedMs: 0,
  outputFormat: setting.outputFormat,
  microphoneEnabled: setting.microphoneEnabledByDefault,
  cameraEnabled: setting.cameraEnabledByDefault,
  cameraAvailable: true,
  sourceType: "window",
});

const getSupportedMimeType = () => {
  const candidates = [
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm",
  ];
  return candidates.find((type) => MediaRecorder.isTypeSupported(type)) || "";
};

const stopStream = (stream: MediaStream | null) => {
  stream?.getTracks().forEach((track) => {
    track.stop();
  });
};

const errorToMessage = (error: unknown) => {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
};

const normalizeCaptureErrorMessage = (error: unknown) => {
  const message = errorToMessage(error);
  if (
    message.includes("Source is not capturable") ||
    message.includes("Could not start video source") ||
    message.includes("Permission denied")
  ) {
    return "当前录制源暂时不能被系统录制。可能原因：窗口或屏幕正在切换全屏、录制源不可用，或 Electron/Chromium 拒绝了该源。请稍后重试。";
  }
  if (
    message.includes("没有找到当前应用窗口") ||
    message.includes("未找到可录制")
  ) {
    return message;
  }
  return `录制初始化失败：${message}`;
};

export const useWhiteboardRecording = ({
  setting,
  onSaved,
  onError,
}: UseWhiteboardRecordingOptions) => {
  const [controlState, setControlState] = useState(() =>
    createInitialState(setting),
  );
  const [cameraOverlay, setCameraOverlay] = useState<CameraOverlayState | null>(
    null,
  );

  const stateRef = useRef(controlState);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const microphoneStreamRef = useRef<MediaStream | null>(null);
  const recordingStreamRef = useRef<MediaStream | null>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const startedAtRef = useRef<number | null>(null);
  const accumulatedMsRef = useRef(0);
  const timerRef = useRef<number | null>(null);
  const stopPromiseRef = useRef<Promise<string | null> | null>(null);
  const lastOutputPathRef = useRef<string | null>(null);

  const publishState = useMemoizedFn(
    (patch: Partial<WhiteboardRecordingControlState>) => {
      const nextState = {
        ...stateRef.current,
        outputFormat: setting.outputFormat,
        ...patch,
      };
      stateRef.current = nextState;
      setControlState(nextState);
      publishWhiteboardRecordingControlState(nextState);
    },
  );

  const resetTimer = useMemoizedFn(() => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  });

  const computeElapsedMs = useMemoizedFn(() => {
    if (!startedAtRef.current) {
      return accumulatedMsRef.current;
    }
    return accumulatedMsRef.current + Date.now() - startedAtRef.current;
  });

  const startTimer = useMemoizedFn(() => {
    resetTimer();
    timerRef.current = window.setInterval(() => {
      publishState({ elapsedMs: computeElapsedMs() });
    }, 500);
  });

  const releaseRecordingStreams = useMemoizedFn(() => {
    stopStream(screenStreamRef.current);
    stopStream(microphoneStreamRef.current);
    stopStream(recordingStreamRef.current);
    screenStreamRef.current = null;
    microphoneStreamRef.current = null;
    recordingStreamRef.current = null;
  });

  const stopCamera = useMemoizedFn(() => {
    stopStream(cameraStreamRef.current);
    cameraStreamRef.current = null;
    setCameraOverlay(null);
  });

  useEffect(() => {
    let cancelled = false;
    const syncCameraAvailability = async () => {
      try {
        if (!navigator.mediaDevices?.enumerateDevices) {
          if (!cancelled) {
            publishState({
              cameraAvailable: false,
              cameraEnabled: false,
            });
          }
          return;
        }

        const devices = await navigator.mediaDevices.enumerateDevices();
        const hasCamera = devices.some(
          (device) => device.kind === "videoinput",
        );
        if (cancelled) return;
        if (!hasCamera) {
          stopCamera();
        }
        publishState({
          cameraAvailable: hasCamera,
          cameraEnabled: hasCamera ? stateRef.current.cameraEnabled : false,
        });
      } catch {
        if (!cancelled) {
          stopCamera();
          publishState({
            cameraAvailable: false,
            cameraEnabled: false,
          });
        }
      }
    };

    void syncCameraAvailability();
    navigator.mediaDevices?.addEventListener(
      "devicechange",
      syncCameraAvailability,
    );
    return () => {
      cancelled = true;
      navigator.mediaDevices?.removeEventListener(
        "devicechange",
        syncCameraAvailability,
      );
    };
  }, [publishState, stopCamera]);

  const startCamera = useMemoizedFn(async () => {
    if (cameraStreamRef.current) {
      return cameraStreamRef.current;
    }
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        width: { ideal: 720 },
        height: { ideal: 720 },
      },
    });
    cameraStreamRef.current = stream;
    setCameraOverlay({ stream, enabled: true });
    return stream;
  });

  const setErrorState = useMemoizedFn((message: string) => {
    publishState({
      status: "error",
      error: message,
    });
    onError?.(message);
  });

  const createDesktopStream = useMemoizedFn(
    async (sourceType: WhiteboardRecordingSourceType) => {
      await prepareWhiteboardRecordingCaptureSource(sourceType);

      if (!navigator.mediaDevices.getDisplayMedia) {
        throw new Error("当前环境不支持窗口录制");
      }
      const stream = await navigator.mediaDevices.getDisplayMedia({
        audio: false,
        video: {
          frameRate: { ideal: 30, max: 30 },
        },
      });
      return stream;
    },
  );

  const startRecording = useMemoizedFn(async () => {
    const current = stateRef.current;
    if (current.status === "recording" || current.status === "saving") {
      return;
    }

    try {
      resetTimer();
      releaseRecordingStreams();
      chunksRef.current = [];
      accumulatedMsRef.current = 0;
      startedAtRef.current = Date.now();
      lastOutputPathRef.current = null;

      const screenStream = await createDesktopStream(current.sourceType);
      screenStreamRef.current = screenStream;

      if (current.microphoneEnabled) {
        microphoneStreamRef.current = await navigator.mediaDevices.getUserMedia(
          {
            audio: true,
            video: false,
          },
        );
      }

      if (current.cameraEnabled) {
        await startCamera();
      }

      const mixedStream = new MediaStream([
        ...screenStream.getVideoTracks(),
        ...(microphoneStreamRef.current?.getAudioTracks() || []),
      ]);
      recordingStreamRef.current = mixedStream;

      const mimeType = getSupportedMimeType();
      const recorder = new MediaRecorder(
        mixedStream,
        mimeType ? { mimeType } : undefined,
      );
      recorderRef.current = recorder;
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };
      recorder.onerror = (event) => {
        setErrorState(event.error?.message || "录制失败");
      };
      recorder.onstop = async () => {
        resetTimer();
        startedAtRef.current = null;
        const elapsedMs = computeElapsedMs();
        publishState({ status: "saving", elapsedMs, error: undefined });

        try {
          const blob = new Blob(chunksRef.current, {
            type: mimeType || "video/webm",
          });
          const buffer = await blob.arrayBuffer();
          const result = await saveWhiteboardRecording({
            bytes: new Uint8Array(buffer),
            outputFormat: setting.outputFormat,
            saveDirectory: setting.saveDirectory,
          });
          publishState({
            status: "completed",
            outputPath: result.outputPath,
            elapsedMs,
            error: undefined,
          });
          lastOutputPathRef.current = result.outputPath;
          onSaved?.(result.outputPath);
        } catch (error) {
          setErrorState(`保存录制失败：${errorToMessage(error)}`);
        } finally {
          releaseRecordingStreams();
          recorderRef.current = null;
          chunksRef.current = [];
          stopPromiseRef.current = null;
        }
      };

      recorder.start(1000);
      publishState({
        status: "recording",
        elapsedMs: 0,
        outputFormat: setting.outputFormat,
        error: undefined,
        outputPath: undefined,
      });
      startTimer();
    } catch (error) {
      resetTimer();
      startedAtRef.current = null;
      releaseRecordingStreams();
      setErrorState(normalizeCaptureErrorMessage(error));
    }
  });

  const pauseRecording = useMemoizedFn(() => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state !== "recording") {
      return;
    }
    recorder.pause();
    accumulatedMsRef.current = computeElapsedMs();
    startedAtRef.current = null;
    resetTimer();
    publishState({
      status: "paused",
      elapsedMs: accumulatedMsRef.current,
    });
  });

  const resumeRecording = useMemoizedFn(() => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state !== "paused") {
      return;
    }
    recorder.resume();
    startedAtRef.current = Date.now();
    publishState({ status: "recording" });
    startTimer();
  });

  const stopRecording = useMemoizedFn(async () => {
    if (stopPromiseRef.current) {
      return stopPromiseRef.current;
    }
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === "inactive") {
      resetTimer();
      releaseRecordingStreams();
      return null;
    }

    accumulatedMsRef.current = computeElapsedMs();
    startedAtRef.current = null;
    resetTimer();
    publishState({
      status: "saving",
      elapsedMs: accumulatedMsRef.current,
    });

    stopPromiseRef.current = new Promise((resolve) => {
      const previousOnStop = recorder.onstop;
      recorder.onstop = async (event) => {
        if (previousOnStop) {
          await previousOnStop.call(recorder, event);
        }
        resolve(lastOutputPathRef.current);
      };
      recorder.stop();
    });
    return stopPromiseRef.current;
  });

  const setSourceType = useMemoizedFn(
    (sourceType: WhiteboardRecordingSourceType) => {
      const currentStatus = stateRef.current.status;
      if (currentStatus === "recording" || currentStatus === "paused") {
        return;
      }
      publishState({ sourceType });
    },
  );

  const setMicrophoneEnabled = useMemoizedFn((enabled: boolean) => {
    const currentStatus = stateRef.current.status;
    if (currentStatus === "recording" || currentStatus === "paused") {
      return;
    }
    publishState({ microphoneEnabled: enabled });
  });

  const setCameraEnabled = useMemoizedFn(async (enabled: boolean) => {
    if (enabled && !stateRef.current.cameraAvailable) {
      return;
    }
    publishState({ cameraEnabled: enabled, error: undefined });
    try {
      if (enabled) {
        await startCamera();
      } else {
        stopCamera();
      }
    } catch (error) {
      stopCamera();
      const message = errorToMessage(error);
      if (
        message.includes("Requested device not found") ||
        message.includes("device not found") ||
        message.includes("NotFoundError")
      ) {
        publishState({
          cameraAvailable: false,
          cameraEnabled: false,
        });
        return;
      }
      publishState({ cameraEnabled: false });
      setErrorState(`摄像头开启失败：${message}`);
    }
  });

  const openControls = useMemoizedFn(async () => {
    await openWhiteboardRecordingControls();
    publishState({});
  });

  const closeControls = useMemoizedFn(async () => {
    await closeWhiteboardRecordingControls();
  });

  const resetRecording = useMemoizedFn(() => {
    resetTimer();
    startedAtRef.current = null;
    accumulatedMsRef.current = 0;
    releaseRecordingStreams();
    stopCamera();
    recorderRef.current = null;
    chunksRef.current = [];
    stopPromiseRef.current = null;
    lastOutputPathRef.current = null;
    publishState({
      ...createInitialState(setting),
      status: "idle",
    });
  });

  useEffect(() => {
    const current = stateRef.current;
    publishState({
      outputFormat: setting.outputFormat,
      microphoneEnabled:
        current.status === "idle"
          ? setting.microphoneEnabledByDefault
          : current.microphoneEnabled,
      cameraEnabled:
        current.status === "idle"
          ? setting.cameraEnabledByDefault
          : current.cameraEnabled,
    });
  }, [publishState, setting]);

  useEffect(() => {
    const listener = async (
      _event: unknown,
      command: WhiteboardRecordingCommand,
    ) => {
      switch (command.type) {
        case "ready":
          publishState({});
          break;
        case "start":
          await startRecording();
          break;
        case "pause":
          pauseRecording();
          break;
        case "resume":
          resumeRecording();
          break;
        case "stop":
          await stopRecording();
          break;
        case "toggle-camera":
          await setCameraEnabled(command.enabled);
          break;
        case "toggle-microphone":
          setMicrophoneEnabled(command.enabled);
          break;
        case "set-source-type":
          setSourceType(command.sourceType);
          break;
        case "close-controls":
          await closeControls();
          break;
      }
    };

    onWhiteboardRecordingControlCommand(listener);
    return () => {
      offWhiteboardRecordingControlCommand(listener);
    };
  }, [
    closeControls,
    pauseRecording,
    publishState,
    resumeRecording,
    setCameraEnabled,
    setMicrophoneEnabled,
    setSourceType,
    startRecording,
    stopRecording,
  ]);

  useEffect(() => {
    return () => {
      resetTimer();
      const recorder = recorderRef.current;
      if (recorder && recorder.state !== "inactive") {
        recorder.stop();
      } else {
        releaseRecordingStreams();
      }
      stopCamera();
      closeWhiteboardRecordingControls();
    };
  }, [releaseRecordingStreams, resetTimer, stopCamera]);

  const api = useMemo(
    () => ({
      state: controlState,
      cameraOverlay,
      openControls,
      closeControls,
      startRecording,
      stopRecording,
      resetRecording,
      setCameraEnabled,
    }),
    [
      cameraOverlay,
      closeControls,
      controlState,
      openControls,
      resetRecording,
      setCameraEnabled,
      startRecording,
      stopRecording,
    ],
  );

  return api;
};
