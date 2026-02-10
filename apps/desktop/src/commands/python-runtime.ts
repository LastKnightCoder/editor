import { invoke, on, off } from "@/electron";

export type PythonRuntimeState =
  | "idle"
  | "checking"
  | "downloading"
  | "ready"
  | "degraded"
  | "error";

export interface PythonRuntimeStatus {
  state: PythonRuntimeState;
  message: string;
  progress: number;
  installedVersion: string | null;
  latestVersion: string | null;
  isDownloading: boolean;
}

export interface PythonRuntimeProgress extends PythonRuntimeStatus {
  trigger: "foreground" | "background";
}

export async function getPythonRuntimeStatus(): Promise<PythonRuntimeStatus> {
  return invoke("python-runtime-status");
}

export async function retryPythonRuntimeDownload(): Promise<{
  success: boolean;
  error?: string;
}> {
  return invoke("python-runtime-retry");
}

export function onPythonRuntimeProgress(
  callback: (progress: PythonRuntimeProgress) => void,
): () => void {
  const handler = (_event: unknown, progress: PythonRuntimeProgress) =>
    callback(progress);
  on("python-runtime-progress", handler);
  return () => off("python-runtime-progress", handler);
}
