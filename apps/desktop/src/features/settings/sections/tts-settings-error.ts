const RAW_MESSAGES = {
  SERVICE_UNAVAILABLE: "语音服务不可用",
  EMPTY_AUDIO: "服务商没有返回音频数据",
  REFERENCE_REQUIRED: "请选择参考音频",
  ALL_CLONES_FAILED: "所有音色都克隆失败",
} as const;
export type TtsSettingsErrorCode = keyof typeof RAW_MESSAGES;
export class TtsSettingsError extends Error {
  constructor(readonly code: TtsSettingsErrorCode) {
    super(RAW_MESSAGES[code]);
    this.name = "TtsSettingsError";
  }
}
