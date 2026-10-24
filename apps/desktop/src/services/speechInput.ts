import {
  createSpeechInputService,
  defaultSpeechInputSetting,
  MAC_NATIVE_ASR_DEFAULTS,
  type ASRAudioFormat,
  type ASREvent,
  type ASRTranscript,
  type ASRStreamSession,
  type SpeechInputSetting,
} from "@tau/asr";
import { copyJson } from "@tau/plugins/host";
import { rendererASRRegistry } from "@/app/plugins/asr-registry";
import { ensureModule } from "@/commands/module-init";
import { on, off } from "@/electron";
import useSettingStore, { markRemoteSettingApplied } from "@/stores/useSettingStore";

export const desktopSpeechInput = createSpeechInputService(async (taskId, signal, onEvent) => {
  if (!useSettingStore.getState().inited) throw new Error("设置尚未加载完成");
  const setting = structuredClone(
    useSettingStore.getState().setting.speechInput ?? defaultSpeechInputSetting()
  );
  await ensureModule("speech-input");
  signal.throwIfAborted();
  await window.electron.invoke("speech-input:claim", taskId);
  let released = false;
  const release = async () => {
    if (released) return;
    released = true;
    clearInterval(heartbeat);
    signal.removeEventListener("abort", abort);
    off("speech-input:closed", closed);
    off("speech-input:event", event);
    await window.electron.invoke("speech-input:release", taskId);
  };
  const revoked = new AbortController();
  const lifetime = AbortSignal.any([signal, revoked.signal]);
  const closed = (_event: unknown, payload: { taskId: string }) => {
    if (payload.taskId === taskId) revoked.abort(new Error("语音输入会话已结束"));
  };
  const event = (_event: unknown, payload: ASREvent) => {
    if (payload.taskId === taskId && !lifetime.aborted) onEvent(payload);
  };
  const abort = () => {
    void release().catch(() => undefined);
  };
  const heartbeat = setInterval(() => {
    void window.electron.invoke("speech-input:heartbeat", taskId).catch(() => revoked.abort());
  }, 5000);
  on("speech-input:closed", closed);
  on("speech-input:event", event);
  signal.addEventListener("abort", abort, { once: true });
  try {
    lifetime.throwIfAborted();
    let session: ASRStreamSession;
    let format: ASRAudioFormat = MAC_NATIVE_ASR_DEFAULTS.format;
    if (setting.active === "native") {
      const availability = await window.electron.invoke<{ state: string; reason?: string }>(
        "speech-input:prepare",
        taskId,
        setting.language
      );
      lifetime.throwIfAborted();
      if (availability.state !== "ready")
        throw new Error(availability.reason ?? "系统语音识别尚未就绪");
      await window.electron.invoke("speech-input:start", taskId, setting.language);
      const result = window.electron.invoke<ASRTranscript>("speech-input:result", taskId);
      void result.catch(() => undefined);
      session = {
        result,
        write: frame => window.electron.invoke("speech-input:write", taskId, frame),
        endInput: () => window.electron.invoke("speech-input:end", taskId),
        cancel: release,
      };
    } else {
      const account = setting.plugin.configurations[setting.plugin.id];
      if (!account) throw new Error("请先在语音输入设置中配置并选用识别插件");
      const { instance } = rendererASRRegistry.create(
        setting.plugin.id,
        copyJson(account.config),
        account.modelId
      );
      const availability = await instance.probe(
        { input: "stream", language: setting.language },
        lifetime
      );
      if (availability.state !== "ready")
        throw new Error(availability.reason ?? "识别插件尚未配置完成");
      format = availability.acceptedAudio?.streamFormats?.[0] ?? MAC_NATIVE_ASR_DEFAULTS.format;
      session = await rendererASRRegistry.openStream(
        setting.plugin.id,
        copyJson(account.config),
        account.modelId,
        { format, language: setting.language },
        { taskId, signal: lifetime, onEvent }
      );
    }
    lifetime.throwIfAborted();
    return { session, format, release };
  } catch (error) {
    await release().catch(() => undefined);
    throw error;
  }
});

export async function updateSpeechInput(operation: unknown) {
  await ensureModule("speech-input");
  const speechInput = await window.electron.invoke<SpeechInputSetting>(
    "speech-input:settings",
    operation
  );
  const next = { ...useSettingStore.getState().setting, speechInput };
  markRemoteSettingApplied(next);
  useSettingStore.setState({ setting: next });
}
