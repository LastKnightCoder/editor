/**
 * 语音输入：沿用用户在 Tau「语音 › 语音输入」里选的识别方式（系统识别或识别插件），插件拿到的是识别文字。
 * 需要在 manifest 声明 speech:input，第一次 start 时 Tau 询问用户；录音只在 start 与 stop / cancel 之间进行。
 */

export interface PluginSpeechSession {
  /** 识别完成后的文字；cancel 或出错时 reject */
  readonly result: Promise<string>;
  /** 停止录音，等待最终结果 */
  stop(): Promise<void>;
  /** 放弃这次录音，result 以 AbortError reject */
  cancel(): Promise<void>;
}

export interface PluginSpeechStartOptions {
  signal?: AbortSignal;
  /** 识别中的实时文字（整段，不是增量） */
  onPreview?(text: string): void;
}

export interface PluginSpeech {
  /** 当前不能录音的原因（如「识别插件账号尚未配置」），可用时为 null；不触发授权询问 */
  unavailableReason(): string | null;
  /** 开始录音；同一时间只能有一次。宿主不支持时抛 SPEECH_UNAVAILABLE 开头的错误 */
  start(options?: PluginSpeechStartOptions): Promise<PluginSpeechSession>;
}
