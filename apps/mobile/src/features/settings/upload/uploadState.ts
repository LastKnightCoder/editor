// 「图片与附件」目的地卡的状态推导：把当前上传位置、配置完整性与最近上传结果翻译成一行状态
// 和修复入口（纯函数，便于单测）。

import type { UploadOutcome } from "../../../services/uploadOutcome";
import { formatRelativeTime } from "../sync/syncState";

export type DestinationState = {
  tone: "ok" | "warn" | "info";
  text: string;
  /** 有修复入口时给出主按钮文案，点击进入当前服务页 */
  fixLabel: string | null;
};

export function deriveDestinationState(input: {
  activeId: string;
  isLocal: boolean;
  configured: boolean;
  outcome: UploadOutcome | null;
  now: number;
}): DestinationState {
  if (!input.isLocal && !input.configured) {
    return { tone: "warn", text: "配置不完整，插入图片会失败", fixLabel: "完成配置" };
  }
  // 换了上传位置后，旧位置的结果不再代表现在
  const outcome = input.outcome?.providerId === input.activeId ? input.outcome : null;
  if (outcome && !outcome.ok) {
    const fixLabel =
      outcome.kind === "auth"
        ? "检查账号"
        : outcome.kind === "location" || outcome.kind === "config"
          ? "检查存储位置"
          : null;
    return { tone: "warn", text: `最近一次没传上去：${outcome.message}`, fixLabel };
  }
  if (outcome?.ok) {
    return {
      tone: "ok",
      text: `上次${input.isLocal ? "保存" : "上传"} ${formatRelativeTime(outcome.at, input.now)} · 正常`,
      fixLabel: null,
    };
  }
  if (input.isLocal) {
    return { tone: "info", text: "换设备也能看到：随资源文件同步", fixLabel: null };
  }
  return { tone: "info", text: "还没有上传过图片", fixLabel: null };
}
