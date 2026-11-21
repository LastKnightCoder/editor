import { readFile } from "node:fs/promises";
import path from "node:path";
import PathUtil from "../utils/PathUtil";
import {
  localTranscriptionOptions,
  transcriptionDefaults,
} from "../../../shared/local-transcription";
import { resolveUsageSlot, type SettingForLlmSlots } from "../modules/llm-usage-slot";

interface StoredSettings extends SettingForLlmSlots {
  transcription?: Parameters<typeof transcriptionDefaults>[0];
  misc?: { transcription?: Parameters<typeof transcriptionDefaults>[1] };
}

export async function readTranscriptionSettings() {
  let setting: StoredSettings = {};
  try {
    setting = JSON.parse(await readFile(path.join(PathUtil.getAppDir(), "setting.json"), "utf8"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const selection = transcriptionDefaults(setting.transcription, setting.misc?.transcription);
  const options = localTranscriptionOptions(selection);
  const llm = options.useLLMOptimization
    ? resolveUsageSlot(setting, "transcriptionOptimization")
    : null;
  return { options, llm };
}
