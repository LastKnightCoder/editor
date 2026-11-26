const RAW_MESSAGES = {
  SERVICE_UNAVAILABLE: "语音服务不可用",
  EMPTY_AUDIO: "服务商没有返回音频数据",
  CLONE_UNSUPPORTED: "当前模型不支持音色复刻",
  AUDIO_SAVE_FAILED: "音频保存失败",
  PLUGIN_SETTINGS_EXPIRED: "插件设置已失效",
} as const;
export type TtsSettingsErrorCode = keyof typeof RAW_MESSAGES;
export class TtsSettingsError extends Error {
  constructor(readonly code: TtsSettingsErrorCode) {
    super(RAW_MESSAGES[code]);
    this.name = "TtsSettingsError";
  }
}
