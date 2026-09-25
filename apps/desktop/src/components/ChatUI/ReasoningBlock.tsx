/**
 * 思考过程（D-048）：折叠行「思考中 3 秒 / 思考了 14 秒」，展开为淡墨正文。
 * 思考中实时计时；默认折叠，不抢正文。
 */

import { useEffect, useState, type ReactNode } from "react";
import { Brain } from "lucide-react";
import { Spinner } from "@tau/ui";
import { FoldBody, FoldRow } from "./FoldRow";

export const formatElapsed = (ms: number) => {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h} 小时 ${m} 分`;
  if (m > 0) return `${m} 分 ${s} 秒`;
  return `${s} 秒`;
};

export function ReasoningBlock({
  startTime,
  endTime,
  duration,
  children,
}: {
  startTime?: number;
  endTime?: number;
  duration?: number;
  /** 展开后渲染的思考内容（调用方决定 markdown 渲染方式） */
  children: ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);
  const thinking = startTime !== undefined && endTime === undefined;
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!thinking) return;
    const timer = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(timer);
  }, [thinking]);

  const elapsed = duration ?? (startTime !== undefined ? (endTime ?? now) - startTime : undefined);
  const title = thinking
    ? `思考中${elapsed !== undefined ? ` ${formatElapsed(elapsed)}` : "…"}`
    : elapsed !== undefined
      ? `思考了 ${formatElapsed(elapsed)}`
      : "思考过程";

  return (
    <div className="my-1 first:mt-0">
      <FoldRow
        icon={
          thinking ? <Spinner className="size-3 border-[1.5px]" /> : <Brain strokeWidth={1.75} />
        }
        title={<span className="tabular-nums">{title}</span>}
        expanded={expanded}
        onToggle={() => setExpanded(v => !v)}
      />
      {expanded && <FoldBody className="text-ink-2">{children}</FoldBody>}
    </div>
  );
}
