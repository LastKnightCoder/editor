/**
 * Markdown 文件独立窗口：左侧文件树，右侧点击按钮（或按 ⌘/）在排版视图与源码之间切换，保存回原文件。
 */
import { useState } from "react";
import { Code2, Eye, FileText, FolderOpen, PanelLeft } from "lucide-react";
import { cn } from "@tau/ui";
import { AppWindow } from "../AppWindow.tsx";

interface MdFile {
  name: string;
  title: string;
  words: number;
  markdown: string;
  rendered: { kind: "h2" | "p" | "quote" | "list"; content: string }[];
}

const FILES: MdFile[] = [
  {
    name: "README.md",
    title: "深度工作读书会",
    words: 96,
    markdown: `## 深度工作读书会

本周讨论《深度工作》第二部分，聚焦**减少注意力残留**与固定时段安排。

> 高质量产出 = 时间 × 专注强度

- 整理各自最容易被打断的 3 个场景
- 尝试每天上午 9:00–11:00 关闭消息通知`,
    rendered: [
      { kind: "h2", content: "深度工作读书会" },
      { kind: "p", content: "本周讨论《深度工作》第二部分，聚焦减少注意力残留与固定时段安排。" },
      { kind: "quote", content: "高质量产出 = 时间 × 专注强度" },
      { kind: "list", content: "整理各自最容易被打断的 3 个场景" },
      { kind: "list", content: "尝试每天上午 9:00–11:00 关闭消息通知" },
    ],
  },
  {
    name: "draft-blog.md",
    title: "为什么我把通知全关了",
    words: 82,
    markdown: `## 为什么我把通知全关了

把微信和邮件的角标关掉一周后，最明显的变化不是回复变慢，而是写长文时不再频繁分神。

- 每天固定 11:30 与 17:30 集中回消息
- 紧急事项通过电话联系`,
    rendered: [
      { kind: "h2", content: "为什么我把通知全关了" },
      {
        kind: "p",
        content:
          "把微信和邮件的角标关掉一周后，最明显的变化不是回复变慢，而是写长文时不再频繁分神。",
      },
      { kind: "list", content: "每天固定 11:30 与 17:30 集中回消息" },
      { kind: "list", content: "紧急事项通过电话联系" },
    ],
  },
  {
    name: "outline.md",
    title: "四条准则速记",
    words: 64,
    markdown: `## 四条准则速记

- 工作要深入：用固定仪式代替临时意志力
- 拥抱无聊：排队和通勤时不立刻刷手机
- 远离社交媒体：只保留真正带来价值的工具
- 摒弃浮浅：给浅层事务设每日上限`,
    rendered: [
      { kind: "h2", content: "四条准则速记" },
      { kind: "list", content: "工作要深入：用固定仪式代替临时意志力" },
      { kind: "list", content: "拥抱无聊：排队和通勤时不立刻刷手机" },
      { kind: "list", content: "远离社交媒体：只保留真正带来价值的工具" },
      { kind: "list", content: "摒弃浮浅：给浅层事务设每日上限" },
    ],
  },
];

export default function MarkdownFilesDemo() {
  const [fileIndex, setFileIndex] = useState(0);
  const [sourceMode, setSourceMode] = useState(false);
  const [showTree, setShowTree] = useState(true);
  const file = FILES[fileIndex];

  return (
    <AppWindow sidebar="none" crumb={`deep-work-notes / ${file.name}`} height={370}>
      <div className="flex h-full">
        {showTree && (
          <aside className="border-line-2 bg-page/60 flex w-[184px] shrink-0 flex-col border-r p-3 max-sm:hidden">
            <div className="text-ink-2 mb-2 flex items-center gap-1.5 px-1.5 text-[12px] font-medium">
              <FolderOpen className="size-3.5" strokeWidth={1.75} />
              deep-work-notes
            </div>
            <div className="space-y-0.5">
              {FILES.map((item, index) => (
                <button
                  key={item.name}
                  type="button"
                  onClick={() => setFileIndex(index)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-[8px] px-2 py-1.5 text-left text-[12.5px] transition-colors",
                    index === fileIndex
                      ? "bg-selected text-ink-1 font-medium"
                      : "text-ink-2 hover:bg-hover"
                  )}
                >
                  <FileText className="size-3.5 shrink-0" strokeWidth={1.75} />
                  <span className="truncate">{item.name}</span>
                </button>
              ))}
            </div>
          </aside>
        )}

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="scrollbar-hide min-h-0 flex-1 overflow-y-auto px-7 pt-5 pb-4 max-sm:px-4">
            {sourceMode ? (
              <pre className="font-tau-mono text-ink-1 text-[12.5px] leading-[1.8] whitespace-pre-wrap">
                {file.markdown}
              </pre>
            ) : (
              <div className="space-y-3 text-[13.5px] leading-[1.75]">
                {file.rendered.map((block, index) => {
                  if (block.kind === "h2")
                    return (
                      <h3 key={index} className="text-tau-title-lg font-semibold">
                        {block.content}
                      </h3>
                    );
                  if (block.kind === "quote")
                    return (
                      <blockquote
                        key={index}
                        className="border-accent text-ink-2 border-l-2 pl-3 italic"
                      >
                        {block.content}
                      </blockquote>
                    );
                  if (block.kind === "list")
                    return (
                      <div key={index} className="flex items-start gap-2 pl-1">
                        <span className="text-ink-3">•</span>
                        <span>{block.content}</span>
                      </div>
                    );
                  return (
                    <p key={index} className="text-ink-1">
                      {block.content}
                    </p>
                  );
                })}
              </div>
            )}
          </div>

          <div className="border-line-2 text-ink-3 text-tau-tiny flex h-9 shrink-0 items-center justify-between border-t px-3.5">
            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={() => setShowTree(value => !value)}
                title="显示或隐藏文件树"
                className="text-ink-2 hover:bg-hover grid size-6 place-items-center rounded-[6px] max-sm:hidden"
              >
                <PanelLeft className="size-3.5" strokeWidth={1.75} />
              </button>
              <span className="tabular-nums">{file.words} 字</span>
              <span>已保存</span>
            </div>
            <button
              type="button"
              onClick={() => setSourceMode(value => !value)}
              className="bg-hover hover:bg-selected text-ink-1 inline-flex h-6 items-center gap-1.5 rounded-[6px] px-2 text-[11.5px] font-medium transition-colors"
            >
              {sourceMode ? (
                <>
                  <Eye className="size-3.5" strokeWidth={1.75} />
                  切回排版视图
                </>
              ) : (
                <>
                  <Code2 className="size-3.5" strokeWidth={1.75} />
                  查看源码
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </AppWindow>
  );
}
