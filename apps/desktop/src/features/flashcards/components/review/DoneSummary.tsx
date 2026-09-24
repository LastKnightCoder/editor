import { Button, cn } from "@tau/ui";
import { Undo2 } from "lucide-react";
import { RATINGS } from "../../model";

import { RATING_TEXT, type Dist } from "../../reviewStyles";

export function DoneSummary({
  dist,
  reviewed,
  minutes,
  onUndo,
  onExit,
}: {
  dist: Dist;
  reviewed: number;
  minutes: number;
  onUndo?: () => void;
  onExit(): void;
}) {
  const remembered = dist.normal + dist.easy;
  return (
    <div className="px-3 pb-1.5 pt-6 text-center">
      <div className="text-[22px] font-semibold tracking-[-0.01em]">
        {reviewed ? "这一轮复习完成了" : "没有需要复习的卡片"}
      </div>
      <p className="text-ink-2 mt-1.5">
        {reviewed
          ? `共 ${reviewed} 张 · 记住 ${Math.round((remembered / reviewed) * 100)}% · 用时约 ${minutes} 分钟`
          : "队列已清空"}
      </p>
      {reviewed > 0 && (
        <div className="mx-auto mt-[22px] grid max-w-[440px] grid-cols-4 gap-2.5">
          {RATINGS.map(r => (
            <div key={r.value} className="border-line-1 rounded-[12px] border px-1 py-2">
              <b className={cn("block text-[17px] tabular-nums", RATING_TEXT[r.value])}>
                {dist[r.value]}
              </b>
              <span className="text-ink-3 text-[11.5px]">{r.label}</span>
            </div>
          ))}
        </div>
      )}
      <div className="mt-[22px] flex justify-center gap-2">
        {onUndo && (
          <Button variant="ghost" icon={Undo2} onClick={onUndo}>
            撤销最后一张
          </Button>
        )}
        <Button variant="primary" onClick={onExit}>
          完成
        </Button>
      </div>
    </div>
  );
}
