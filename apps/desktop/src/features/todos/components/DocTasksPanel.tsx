/**
 * 「文档中」视图：按文档分组列出正文里的勾选项，顺序与层级同原文。
 * 已完成默认收起，展开时才取该篇全部条目。
 */

import { useState } from "react";
import { ChevronDown, ExternalLink } from "lucide-react";
import { FadeScroll, cn } from "@tau/ui";
import type { DocTaskItem, DocTaskSnapshot, DocTaskSource } from "@/types/doc-tasks";
import { useDocTasksOf } from "@/hooks/useDocTasks";
import { DocTaskRow, openDocTask } from "./DocTaskBits";

const KIND_LABEL: Record<DocTaskSource["ref"]["kind"], string> = {
  card: "卡片",
  article: "文章",
  "project-item": "项目文档",
  "diary-moment": "日记",
  "plugin-entity": "插件内容",
};

export function DocTasksPanel({
  snapshot,
  now,
  selected,
  onToggle,
  onOpen,
}: {
  snapshot: DocTaskSnapshot;
  now: number;
  selected: DocTaskItem | null;
  onToggle(task: DocTaskItem): void;
  onOpen(task: DocTaskItem): void;
}) {
  const sources = snapshot.sources.filter(s => s.openCount > 0 || s.doneCount > 0);
  return (
    <FadeScroll className="relative mb-4 min-h-0 min-w-0 flex-1 pb-6 pl-[22px] pr-2">
      {sources.length === 0 ? (
        <div className="text-ink-3 flex flex-col items-center gap-1.5 py-20 text-center text-[12.5px]">
          <p className="text-ink-2 text-[15px] font-medium">文档里还没有待办</p>
          <p>在任意卡片、文章、日记里输入 [] 加空格创建勾选项，就会出现在这里</p>
        </div>
      ) : (
        sources.map(source => (
          <DocSection
            key={source.contentId}
            source={source}
            open={snapshot.open.filter(t => t.contentId === source.contentId)}
            now={now}
            selected={selected}
            onToggle={onToggle}
            onOpen={onOpen}
          />
        ))
      )}
    </FadeScroll>
  );
}

function DocSection({
  source,
  open,
  now,
  selected,
  onToggle,
  onOpen,
}: {
  source: DocTaskSource;
  open: DocTaskItem[];
  now: number;
  selected: DocTaskItem | null;
  onToggle(task: DocTaskItem): void;
  onOpen(task: DocTaskItem): void;
}) {
  const [showDone, setShowDone] = useState(false);
  const all = useDocTasksOf(showDone ? source.contentId : null).data;
  const rows = (showDone && all ? all : open).filter(task => !task.promoted);
  const isSelected = (task: DocTaskItem) =>
    selected?.contentId === task.contentId && selected.taskId === task.taskId;

  return (
    <section className="group/doc relative mb-[18px]">
      <header className="sticky top-0 z-[2] -mx-1.5 flex items-baseline gap-2.5 bg-[linear-gradient(180deg,var(--tau-bg-surface)_calc(100%_-_10px),transparent)] px-2.5 pb-2 pt-1.5">
        <button
          type="button"
          onClick={() => openDocTask(source)}
          className="hover:text-accent-text min-w-0 truncate text-[15px] font-semibold tracking-[-0.01em]"
        >
          {source.title}
        </button>
        <span className="text-ink-3 shrink-0 text-[11.5px]">
          {KIND_LABEL[source.ref.kind]}
          {source.meta && ` · ${source.meta}`}
        </span>
        <span className="text-ink-3 ml-auto shrink-0 text-[11.5px] tabular-nums">
          {source.openCount} 项
        </span>
        <button
          type="button"
          title="打开原文"
          onClick={() => openDocTask(source)}
          className="text-ink-3 hover:text-ink-1 opacity-0 transition-opacity group-hover/doc:opacity-100"
        >
          <ExternalLink className="size-[13px]" strokeWidth={1.75} />
        </button>
      </header>
      <div className="-mx-1.5">
        {rows.map(task => (
          <DocTaskRow
            key={task.taskId}
            task={task}
            source={source}
            now={now}
            showSource={false}
            indent={task.depth}
            selected={isSelected(task)}
            onToggle={onToggle}
            onOpen={onOpen}
          />
        ))}
        {source.doneCount > 0 && (
          <button
            type="button"
            onClick={() => setShowDone(v => !v)}
            className="text-ink-3 hover:text-ink-2 flex items-center gap-1.5 pb-1 pl-5 pr-3.5 pt-1.5 text-[11.5px]"
          >
            <ChevronDown
              className={cn(
                "ease-tau-out size-[13px] transition-transform duration-200",
                !showDone && "-rotate-90"
              )}
              strokeWidth={1.75}
            />
            {showDone ? "隐藏已完成" : `显示 ${source.doneCount} 项已完成`}
          </button>
        )}
      </div>
    </section>
  );
}
