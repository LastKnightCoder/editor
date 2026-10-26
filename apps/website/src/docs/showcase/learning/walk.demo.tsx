/**
 * 漫步：一张旧内容卡片，右侧是「从这里走向」的岔路。点岔路换一条，顶部足迹追加一步；
 * 按空格或点「随机跳一下」换个方向。结构按 features/walk 的 WalkCard、WalkForks 与 WalkTrail 重建。
 */
import { useState } from "react";
import { ExternalLink, EyeOff, Repeat, Shuffle } from "lucide-react";
import { cn } from "@tau/ui";
import { AppWindow } from "../AppWindow.tsx";

interface Item {
  id: number;
  type: "卡片" | "文章" | "日记" | "PDF 批注";
  title: string;
  quote: string;
  date: string;
  forks: { id: number; relation: "双链" | "语义相近" | "标签" }[];
}

const ITEMS: Record<number, Item> = {
  1: {
    id: 1,
    type: "卡片",
    title: "专注是可以练习的能力",
    quote: "像肌肉一样，越用越强；也会因为长期不用而萎缩。",
    date: "2025-11-02",
    forks: [
      { id: 2, relation: "双链" },
      { id: 3, relation: "语义相近" },
      { id: 4, relation: "标签" },
    ],
  },
  2: {
    id: 2,
    type: "文章",
    title: "Deep Work 读书笔记",
    quote: "深度工作是一种越来越稀缺、也越来越有价值的能力。",
    date: "2025-10-21",
    forks: [
      { id: 1, relation: "双链" },
      { id: 5, relation: "语义相近" },
    ],
  },
  3: {
    id: 3,
    type: "日记",
    title: "河边散步",
    quote: "走了一圈，想清楚了卡了一下午的那段开头。",
    date: "2025-09-14",
    forks: [
      { id: 6, relation: "语义相近" },
      { id: 1, relation: "语义相近" },
    ],
  },
  4: {
    id: 4,
    type: "卡片",
    title: "注意力残留",
    quote: "从一件事切到另一件，注意力会有一部分留在上一件上。",
    date: "2025-08-30",
    forks: [
      { id: 2, relation: "标签" },
      { id: 5, relation: "双链" },
    ],
  },
  5: {
    id: 5,
    type: "PDF 批注",
    title: "《心流》第 3 章",
    quote: "当挑战与能力恰好匹配，人会进入一种忘我的状态。",
    date: "2025-07-18",
    forks: [
      { id: 4, relation: "双链" },
      { id: 6, relation: "标签" },
    ],
  },
  6: {
    id: 6,
    type: "卡片",
    title: "无聊是创造力的入口",
    quote: "不急着拿起手机的那几分钟，常常冒出最好的想法。",
    date: "2025-06-05",
    forks: [
      { id: 3, relation: "语义相近" },
      { id: 1, relation: "标签" },
    ],
  },
};

interface Step {
  id: number;
  via: string;
  random?: boolean;
}

export default function WalkDemo() {
  const [trail, setTrail] = useState<Step[]>([{ id: 1, via: "317 天没见过它了" }]);
  const current = ITEMS[trail[trail.length - 1].id];

  const go = (id: number, via: string, random = false) =>
    setTrail(list => [...list.slice(-4), { id, via, random }]);
  const jump = () => {
    const candidates = Object.keys(ITEMS)
      .map(Number)
      .filter(id => id !== current.id);
    const id = candidates[Math.floor(Math.random() * candidates.length)];
    go(id, "随机跳到这里", true);
  };

  return (
    <AppWindow active="walk" crumb="漫步" height={420}>
      <div
        tabIndex={0}
        onKeyDown={event => {
          if (event.key === " ") {
            event.preventDefault();
            jump();
          }
        }}
        className="flex h-full flex-col outline-none"
      >
        <div className="flex h-10 shrink-0 items-baseline gap-3 px-8 pt-5 max-sm:px-4">
          <h3 className="text-tau-title-lg font-semibold tracking-[-0.01em]">漫步</h3>
          <span className="text-tau-meta text-ink-2 max-sm:hidden">从你写过的东西里随便走走</span>
        </div>
        <div className="text-tau-sm text-ink-3 mt-4 flex h-[30px] shrink-0 items-center gap-2 overflow-hidden px-8 max-sm:px-4">
          足迹
          {trail.map((step, index) => (
            <span
              key={`${step.id}-${index}`}
              className="animate-doc-in flex shrink-0 items-center gap-2"
            >
              {index > 0 && <i className="bg-line-2 h-px w-4" />}
              {step.random && <Shuffle className="text-accent size-3" strokeWidth={1.75} />}
              <span
                className={cn(
                  "max-w-[8em] truncate",
                  index === trail.length - 1 ? "text-ink-1 font-medium" : ""
                )}
              >
                {ITEMS[step.id].title}
              </span>
            </span>
          ))}
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_240px] gap-5 px-8 pt-3 pb-6 max-md:grid-cols-1 max-sm:px-4">
          <article
            key={`${current.id}-${trail.length}`}
            className="border-line-1 animate-doc-in flex flex-col rounded-[16px] border px-7 pt-6 pb-4"
          >
            <div className="flex items-center gap-2">
              <span className="bg-accent-soft text-accent-text text-tau-sm inline-flex h-[22px] items-center rounded-full px-2">
                {current.type}
              </span>
              <span className="text-ink-3 text-tau-sm">写于 {current.date}</span>
            </div>
            <p className="text-accent-text text-tau-sm mt-3">{trail[trail.length - 1].via}</p>
            <h4 className="text-tau-title mt-1.5 line-clamp-2 font-semibold">{current.title}</h4>
            <blockquote className="border-accent text-tau-body-lg mt-3 border-l-2 pl-4 leading-[1.85]">
              {current.quote}
            </blockquote>
            <span className="flex-1" />
            <div className="text-ink-2 text-tau-sm mt-4 flex items-center gap-1">
              <span className="hover:bg-hover flex items-center gap-1.5 rounded-[8px] px-2 py-1">
                <ExternalLink className="size-3.5" strokeWidth={1.75} />
                打开原文
              </span>
              <span className="hover:bg-hover flex items-center gap-1.5 rounded-[8px] px-2 py-1">
                <Repeat className="size-3.5" strokeWidth={1.75} />
                做成闪卡
              </span>
              <span
                className="hover:bg-hover ml-auto grid size-7 place-items-center rounded-[8px]"
                title="别再抽到这条"
              >
                <EyeOff className="size-3.5" strokeWidth={1.75} />
              </span>
            </div>
          </article>

          <aside className="flex flex-col gap-2 max-md:hidden">
            <p className="text-tau-sm text-ink-2 font-semibold">从这里走向</p>
            {current.forks.map(fork => {
              const target = ITEMS[fork.id];
              return (
                <button
                  key={fork.id}
                  type="button"
                  onClick={() =>
                    go(
                      fork.id,
                      `从「${current.title}」经${fork.relation === "标签" ? "标签" : fork.relation === "双链" ? "双链" : "相近的内容"}走来`
                    )
                  }
                  className="rounded-tau-md border-line-1 hover:border-accent flex flex-col items-start gap-1 border px-3 py-2.5 text-left transition-[border-color,transform] duration-150 hover:translate-x-0.5"
                >
                  <span className="text-ink-3 text-[11px]">{fork.relation}</span>
                  <span className="text-tau-sm line-clamp-1 font-medium">{target.title}</span>
                </button>
              );
            })}
            <button
              type="button"
              onClick={jump}
              className="border-line-1 text-ink-2 hover:text-ink-1 hover:border-ink-3 rounded-tau-md flex h-10 items-center justify-center gap-2 border border-dashed text-[12.5px]"
            >
              <Shuffle className="size-3.5" strokeWidth={1.75} />
              换个方向，随机跳一下
              <kbd className="bg-hover rounded px-1 font-mono text-[10.5px]">Space</kbd>
            </button>
          </aside>
        </div>
      </div>
    </AppWindow>
  );
}
