/**
 * 待重设计子页的占位空态（骨架阶段的诚实空态，不造演示数据）。
 */

import { PenLine } from "lucide-react";

export function PendingSection({ label }: { label: string }) {
  return (
    <div className="text-ink-3 flex h-full min-h-[280px] flex-col items-center justify-center gap-1.5 py-16 text-center">
      <PenLine size={26} strokeWidth={1.4} className="text-ink-3/50" />
      <div className="text-tau-body text-ink-2 font-medium">{label} · 待重新设计</div>
      <p className="text-tau-meta text-ink-3 max-w-[300px] leading-relaxed">
        设置骨架已就位，本部分将按新设计系统逐页重设计后在此呈现。
      </p>
    </div>
  );
}
