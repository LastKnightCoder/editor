import { invoke, on, off } from "@/electron";

export type WhiteboardRecordingOutputFormat = "webm" | "mp4" | "mov" | "mkv";
export type WhiteboardRecordingSourceType = "screen" | "window";

export interface WhiteboardRecordingSource {
  id: string;
  name: string;
  type: WhiteboardRecordingSourceType;
  thumbnailDataUrl: string;
  displayId?: string;
}

export type WhiteboardRecordingStatus =
  | "idle"
  | "recording"
  | "paused"
  | "saving"
  | "completed"
  | "error";

export interface WhiteboardRecordingControlState {
  status: WhiteboardRecordingStatus;
  elapsedMs: number;
  outputFormat: WhiteboardRecordingOutputFormat;
  microphoneEnabled: boolean;
  cameraEnabled: boolean;
  cameraAvailable: boolean;
  sourceType: WhiteboardRecordingSourceType;
  error?: string;
  outputPath?: string;
}

export type WhiteboardRecordingCommand =
  | { type: "ready" }
  | { type: "resize-controls"; width: number; height: number }
  | { type: "start" }
  | { type: "pause" }
  | { type: "resume" }
  | { type: "stop" }
  | { type: "toggle-camera"; enabled: boolean }
  | { type: "toggle-microphone"; enabled: boolean }
  | { type: "set-source-type"; sourceType: WhiteboardRecordingSourceType }
  | { type: "close-controls" };

export const getWhiteboardRecordingSources = async () => {
  return await invoke<WhiteboardRecordingSource[]>(
    "whiteboard-recording:get-sources",
  );
};

export const getDefaultWhiteboardRecordingSaveDirectory = async () => {
  return await invoke<string>(
    "whiteboard-recording:get-default-save-directory",
  );
};

export const saveWhiteboardRecording = async (payload: {
  bytes: Uint8Array;
  outputFormat: WhiteboardRecordingOutputFormat;
  saveDirectory?: string;
}) => {
  return await invoke<{ outputPath: string; format: string }>(
    "whiteboard-recording:save",
    payload,
  );
};

export const prepareWhiteboardRecordingCaptureSource = async (
  sourceType: WhiteboardRecordingSourceType,
) => {
  return await invoke<{
    id: string;
    name: string;
    type: WhiteboardRecordingSourceType;
    mediaSourceId?: string;
  }>("whiteboard-recording:prepare-capture-source", {
    sourceType,
  });
};

export const openWhiteboardRecordingControls = async () => {
  return await invoke("whiteboard-recording:open-controls");
};

export const closeWhiteboardRecordingControls = async () => {
  return await invoke("whiteboard-recording:close-controls");
};

export const resizeWhiteboardRecordingControls = async (payload: {
  width: number;
  height: number;
}) => {
  return await invoke("whiteboard-recording:controls-resize", payload);
};

export const moveWhiteboardRecordingControls = async (payload: {
  x: number;
  y: number;
}) => {
  return await invoke("whiteboard-recording:controls-move", payload);
};

export const sendWhiteboardRecordingControlCommand = async (
  command: WhiteboardRecordingCommand,
) => {
  return await invoke("whiteboard-recording:controls-command", command);
};

export const publishWhiteboardRecordingControlState = async (
  state: WhiteboardRecordingControlState,
) => {
  return await invoke("whiteboard-recording:controls-state", state);
};

export const onWhiteboardRecordingControlCommand = (
  listener: (_event: unknown, command: WhiteboardRecordingCommand) => void,
) => {
  on("whiteboard-recording:controls-command", listener);
};

export const offWhiteboardRecordingControlCommand = (
  listener: (_event: unknown, command: WhiteboardRecordingCommand) => void,
) => {
  off("whiteboard-recording:controls-command", listener);
};

export const onWhiteboardRecordingControlState = (
  listener: (_event: unknown, state: WhiteboardRecordingControlState) => void,
) => {
  on("whiteboard-recording:controls-state", listener);
};

export const offWhiteboardRecordingControlState = (
  listener: (_event: unknown, state: WhiteboardRecordingControlState) => void,
) => {
  off("whiteboard-recording:controls-state", listener);
};
