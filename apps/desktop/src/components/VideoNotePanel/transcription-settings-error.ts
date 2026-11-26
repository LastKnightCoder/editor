export class TranscriptionSettingsError extends Error {
  readonly code = "TRANSCRIPTION_MODEL_DOWNLOAD_FAILED";
  constructor() {
    super("模型下载失败");
    this.name = "TranscriptionSettingsError";
  }
}
