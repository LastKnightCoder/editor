import { type SpeechInputSetting } from "@tau/asr";
import { invoke } from "@/electron";
import { ensureModule } from "@/commands/module-init";
import useSettingStore, { markRemoteSettingApplied } from "@/stores/useSettingStore";

export async function updateSpeechInput(operation: unknown) {
  await ensureModule("speech-input");
  const speechInput = await invoke<SpeechInputSetting>("speech-input:settings", operation);
  const next = { ...useSettingStore.getState().setting, speechInput };
  markRemoteSettingApplied(next);
  useSettingStore.setState({ setting: next });
}
