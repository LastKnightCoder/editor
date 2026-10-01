/** 扩展运行期错误的上报（01 §5.2）：宿主可接入自己的日志 / 提示，缺省只写控制台 */
export interface ExtensionErrorEvent {
  /** 出错扩展的元素 type；内核自带的快捷键记为 "editor" */
  extension: string;
  phase: "render" | "plugin" | "behavior" | "hotkey" | "command" | "ingest" | "copy";
  error: unknown;
  /** 这次错误是否触发熔断（该扩展的行为与快捷键此后停用） */
  disabled: boolean;
}

export interface ExtensionErrorReporter {
  report(event: ExtensionErrorEvent): void;
}

export const consoleErrorReporter: ExtensionErrorReporter = {
  report({ extension, phase, error, disabled }) {
    console.error(
      `[editor] 扩展 "${extension}" ${phase} 出错${disabled ? "，已停用" : ""}:`,
      error
    );
  },
};
