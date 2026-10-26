/** 选一条路线：按场景给出三四篇的阅读顺序 */
import { useState } from "react";
import { BookOpen, CalendarCheck, Feather, NotebookPen, type LucideIcon } from "lucide-react";
import { cn } from "@tau/ui";
import { DocLinkButton } from "../DocLinkButton.tsx";

interface Path {
  icon: LucideIcon;
  title: string;
  who: string;
  steps: { slug: string; title: string; why: string }[];
}

const PATHS: Path[] = [
  {
    icon: NotebookPen,
    title: "随手记",
    who: "随时记录想法，以后再整理",
    steps: [
      { slug: "cards", title: "卡片", why: "记录短小的想法，无需标题" },
      { slug: "diary", title: "日记", why: "按天记录，方便日后查看" },
      { slug: "walk", title: "漫步与知识地图", why: "回顾以前写过的内容" },
    ],
  },
  {
    icon: BookOpen,
    title: "读书学习",
    who: "读书、上课，系统地学习一个主题",
    steps: [
      {
        slug: "reading",
        title: "收集与阅读",
        why: "保存划线和批注，并保留出处",
      },
      { slug: "notebook", title: "Notebook", why: "围绕资料提问，整理大纲" },
      { slug: "cards", title: "卡片", why: "用自己的话记录理解" },
      { slug: "flashcards", title: "闪卡复习", why: "按记忆规律安排复习" },
    ],
  },
  {
    icon: Feather,
    title: "写作输出",
    who: "写长文、整理系列文档，或发布到网上",
    steps: [
      { slug: "editor", title: "编辑器基础", why: "了解语法和快捷键" },
      { slug: "articles", title: "文章", why: "在创作模式中参照资料写作" },
      { slug: "projects", title: "项目", why: "按目录组织一整套文档" },
      { slug: "publish", title: "发布", why: "把内容发布为网站" },
    ],
  },
  {
    icon: CalendarCheck,
    title: "管好每一天",
    who: "安排日程，专注完成任务",
    steps: [
      { slug: "today", title: "今日", why: "查看今天要做的事" },
      { slug: "todos", title: "待办与日程", why: "快速添加待办，安排到日历" },
      { slug: "pomodoro", title: "番茄专注", why: "计时专注，记录专注时间" },
    ],
  },
];

export default function PathsDemo() {
  const [index, setIndex] = useState(0);
  const path = PATHS[index];
  return (
    <div className="border-line-1 bg-surface shadow-card overflow-hidden rounded-[16px] border">
      <div role="tablist" aria-label="选择场景" className="grid grid-cols-4 max-sm:grid-cols-2">
        {PATHS.map((item, itemIndex) => {
          const Icon = item.icon;
          const on = itemIndex === index;
          return (
            <button
              key={item.title}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => setIndex(itemIndex)}
              className={cn(
                "border-line-1 flex flex-col items-start gap-2 border-b px-4 py-4 text-left transition-colors duration-200",
                on ? "bg-accent-soft" : "hover:bg-hover"
              )}
            >
              <Icon
                size={20}
                strokeWidth={1.75}
                className={on ? "text-accent-text" : "text-ink-3"}
              />
              <span className={cn("text-[15px] font-semibold", on ? "text-ink-1" : "text-ink-2")}>
                {item.title}
              </span>
              <span className="text-ink-3 text-[12px] leading-snug">{item.who}</span>
            </button>
          );
        })}
      </div>
      <ol key={path.title} className="flex flex-col gap-1 p-4">
        {path.steps.map((step, stepIndex) => (
          <li
            key={step.slug}
            className="animate-doc-in hover:bg-hover flex items-center gap-4 rounded-[10px] px-3 py-2.5"
            style={{ animationDelay: `${stepIndex * 60}ms` }}
          >
            <span className="bg-accent text-ink-inverse grid size-6 shrink-0 place-items-center rounded-full text-[12px] font-semibold tabular-nums">
              {stepIndex + 1}
            </span>
            <DocLinkButton slug={step.slug} className="text-ink-1 text-[15px] font-medium">
              {step.title}
            </DocLinkButton>
            <span className="text-ink-3 text-[13px]">{step.why}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
