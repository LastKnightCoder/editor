import { useEffect, useState } from "react";
import { getQwenHardware, type ModelInfo } from "@/commands/model-downloader";
import {
  qwenRuntimeId,
  type LocalTranscriptionEngine,
  type QwenHardwareReport,
} from "../../../shared/local-transcription";

export function useQwenHardware(engine: LocalTranscriptionEngine, models: ModelInfo[]) {
  const gpu = models.find(model => model.name === qwenRuntimeId("gpu"));
  const enabled = engine === "qwen" && !!gpu;
  const installed = gpu?.downloaded;
  const [attempt, setAttempt] = useState(0);
  const [report, setReport] = useState<QwenHardwareReport>();
  useEffect(() => {
    let current = true;
    setReport(undefined);
    if (enabled) {
      getQwenHardware()
        .then(result => {
          if (current) setReport(result);
        })
        .catch(() => {
          if (current) setReport({ state: "unknown", names: [] });
        });
    }
    return () => {
      current = false;
    };
  }, [enabled, installed, attempt]);
  return { report: enabled ? report : undefined, refresh: () => setAttempt(n => n + 1) };
}
