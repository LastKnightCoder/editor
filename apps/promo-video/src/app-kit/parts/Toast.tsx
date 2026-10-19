/** 成功提示胶囊，结构摘自 packages/ui/src/primitives/Toast.tsx（窗口内顶部居中 top-[62px]，入场自上滑下） */
import { CircleCheck } from "lucide-react";

export function Toast({ message, appear, action }: { message: string; appear: number; action?: string }) {
  if (appear <= 0) return null;
  return (
    <div className="pointer-events-none absolute top-[62px] left-1/2 z-[360] flex flex-col items-center" style={{ transform: "translateX(-50%)" }}>
      <div
        className="border-line-1 bg-surface text-ink-1 shadow-float text-tau-sm flex min-h-[36px] max-w-[420px] items-center gap-2.5 rounded-full border px-[15px]"
        style={{ opacity: appear, transform: `translateY(${(1 - appear) * -14}px)` }}
      >
        <CircleCheck size={15} strokeWidth={2} className="text-ok flex-none" />
        <span className="truncate py-[7px]">{message}</span>
        {action && <span className="text-accent-text flex-none rounded-[7px] px-[7px] py-1 text-[12px] font-semibold">{action}</span>}
      </div>
    </div>
  );
}
