import { Lock } from "lucide-react";
import { ChromeBar } from "../chrome";

/** 文档版本过高时的只读提示条：不可关闭、无操作，仅说明状态（普通 readonly 不渲染） */
export default function ReadonlyNotice() {
  return (
    <ChromeBar
      role="status"
      className="ease-tau-out starting:-translate-y-1.5 starting:opacity-0 motion-reduce:starting:translate-y-0 left-1/2 top-3 h-[38px] -translate-x-1/2 select-none gap-2 whitespace-nowrap pl-[11px] pr-3.5 transition-[opacity,translate] delay-[120ms] duration-200"
    >
      <Lock className="text-ink-2 size-[15px] shrink-0" strokeWidth={2} aria-hidden />
      <span className="text-tau-meta text-ink-1 font-medium">只读</span>
      <span aria-hidden className="bg-ink-3/70 size-[3px] rounded-full" />
      <span className="text-tau-sm text-ink-3">此白板由更新版本的应用保存，更新应用后即可编辑</span>
    </ChromeBar>
  );
}
