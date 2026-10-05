/**
 * 今日页「继续」段的第一块：「✦ 洞见」，一次只说一件事（‹ › 换一条），关键的几个字下面画一道线；
 * 两个按钮：去看看（打开地图并点亮那一处 / 打开项目回顾）、不相关（回顾是「知道了」）。什么都没有时整块不出现。
 */

import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, FolderOpen, Map as MapIcon, Sparkles } from "lucide-react";
import { Button, cn } from "@tau/ui";
import { usePage } from "@/page/PageProvider";
import { useTodayInsights } from "../insightQueries";
import type { TodayInsight } from "../insightItems";

const UNDERLINE: Record<TodayInsight["kind"], string> = {
  bridge: "bg-[linear-gradient(var(--tau-info),var(--tau-info))]",
  asked: "bg-[linear-gradient(var(--tau-warn),var(--tau-warn))]",
  topic: "bg-[linear-gradient(var(--tau-ink-3),var(--tau-ink-3))]",
  review: "bg-[linear-gradient(var(--tau-accent),var(--tau-accent))]",
};

export function InsightCard() {
  const { items, dismiss } = useTodayInsights();
  const { navigator } = usePage();
  const [index, setIndex] = useState(0);
  // 处理掉一条后序号可能越界
  useEffect(() => {
    if (index >= items.length && items.length) setIndex(items.length - 1);
  }, [index, items.length]);
  if (!items.length) return null;
  const item = items[Math.min(index, items.length - 1)];
  const step = (delta: number) => setIndex((index + delta + items.length) % items.length);
  const go = () => {
    if (item.open.page === "knowledge-map") {
      navigator.push("knowledge-map", { insight: item.open.insight });
    } else {
      navigator.push("project-detail", { id: item.open.projectId, review: "1" });
    }
  };

  return (
    <div
      className="border-line-2 rounded-tau-lg grid grid-cols-[1fr_auto] items-center gap-3.5 border py-3 pl-4 pr-3.5"
      data-today-insight
    >
      <div className="min-w-0">
        <div className="mb-1.5 flex items-center gap-2 text-[13.5px] font-semibold">
          <Sparkles className="text-accent size-3.5" strokeWidth={1.75} />
          洞见
          <small className="text-ink-3 text-[12px] font-normal">AI 从你的知识版图里看到的</small>
          {items.length > 1 && (
            <span className="text-ink-3 ml-2 flex items-center gap-0.5 text-[12px] font-normal tabular-nums">
              <button
                type="button"
                aria-label="上一条"
                onClick={() => step(-1)}
                className="hover:bg-hover hover:text-ink-1 rounded p-0.5"
              >
                <ChevronLeft className="size-[13px]" strokeWidth={1.75} />
              </button>
              {Math.min(index, items.length - 1) + 1} / {items.length}
              <button
                type="button"
                aria-label="下一条"
                onClick={() => step(1)}
                className="hover:bg-hover hover:text-ink-1 rounded p-0.5"
              >
                <ChevronRight className="size-[13px]" strokeWidth={1.75} />
              </button>
            </span>
          )}
        </div>
        <p key={item.key} className="text-ink-1 animate-fadeIn text-[14px] leading-[1.75]">
          <span className="text-ink-3 mr-2 text-[11.5px]">{item.label}</span>
          {item.before}
          <em
            className={cn(
              "animate-insight-draw bg-[length:100%_2px] bg-bottom bg-no-repeat not-italic",
              UNDERLINE[item.kind]
            )}
          >
            {item.em}
          </em>
          {item.after}
        </p>
      </div>
      <div className="flex gap-1.5">
        <Button
          size="sm"
          variant="primary"
          icon={item.open.page === "knowledge-map" ? MapIcon : FolderOpen}
          onClick={go}
        >
          {item.action}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => dismiss(item)}>
          {item.kind === "review" ? "知道了" : "不相关"}
        </Button>
      </div>
    </div>
  );
}
