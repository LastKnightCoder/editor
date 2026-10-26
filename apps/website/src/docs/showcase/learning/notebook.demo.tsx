/**
 * Notebook：左边目录（资料与产物），中间阅读，右边对话。点一份资料，对话从中间移到右栏；
 * 点底部「基于这份资料」的一个产物，目录里先出现「生成中」再完成。
 * 结构按 features/vibe-learning 的 VibeLearningView、tree 与 ResourceStage 重建。
 */
import { useEffect, useState } from "react";
import {
  ArrowUp,
  BookOpen,
  ChevronDown,
  FileText,
  Globe,
  ListTree,
  Network,
  PenLine,
  Plus,
  Sparkles,
  Video,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@tau/ui";
import { AppWindow } from "../AppWindow.tsx";

interface Resource {
  id: number;
  title: string;
  icon: LucideIcon;
  body: string;
}

const RESOURCES: Resource[] = [
  {
    id: 1,
    title: "心流 · 第三章.pdf",
    icon: FileText,
    body: "心流最常出现在挑战与能力恰好匹配的时候：太难让人焦虑，太简单又让人无聊。要进入心流，目标必须清晰，反馈必须及时……",
  },
  {
    id: 2,
    title: "为什么我们无法专注",
    icon: Globe,
    body: "研究显示，办公室员工平均每 3 分钟就会被打断一次，而重新回到原来的任务平均需要 23 分钟……",
  },
  {
    id: 3,
    title: "深度工作讲座",
    icon: Video,
    body: "（视频转写）我想讲的第一件事是：深度工作不是天赋，是一种可以训练的能力……",
  },
];

interface Output {
  id: number;
  title: string;
  icon: LucideIcon;
  status: "生成中" | string;
}

const KINDS: { label: string; icon: LucideIcon; meta?: string }[] = [
  { label: "学习大纲", icon: ListTree },
  { label: "重点提炼", icon: Sparkles },
  { label: "思维导图", icon: Network },
  { label: "测验", icon: PenLine, meta: "8 题" },
];

export default function NotebookDemo() {
  const [openId, setOpenId] = useState<number | null>(null);
  const [outputs, setOutputs] = useState<Output[]>([
    { id: 1, title: "学习大纲", icon: ListTree, status: "" },
  ]);
  const opened = RESOURCES.find(resource => resource.id === openId);

  useEffect(() => {
    const pending = outputs.find(output => output.status === "生成中");
    if (!pending) return;
    const timer = setTimeout(() => {
      setOutputs(list =>
        list.map(output =>
          output.id === pending.id
            ? {
                ...output,
                status: KINDS.find(kind => output.title.startsWith(kind.label))?.meta ?? "",
              }
            : output
        )
      );
    }, 1600);
    return () => clearTimeout(timer);
  }, [outputs]);

  const generate = (kind: (typeof KINDS)[number]) =>
    setOutputs(list => [
      ...list,
      {
        id: Date.now(),
        title: `${kind.label} · ${opened?.title.replace(/\.pdf$/, "")}`,
        icon: kind.icon,
        status: "生成中",
      },
    ]);

  const row = "text-tau-meta flex h-[30px] items-center gap-2 rounded-[7px] pr-1 pl-2";

  const chat = (
    <div className="flex h-full min-w-0 flex-col">
      <div className="scrollbar-hide flex-1 overflow-y-auto px-5 pt-5">
        <div className="bg-accent/[0.18] ml-auto w-fit max-w-[82%] rounded-[14px_14px_4px_14px] px-3.5 py-2 text-[13.5px]">
          为什么被打断之后很难回到原来的状态？
        </div>
        <p className="text-tau-body mt-4 leading-[1.8]">
          资料里给了两个原因。一是<b>注意力残留</b>
          ：《为什么我们无法专注》提到，切换任务后，一部分注意力还停在上一件事上。二是《心流》第三章说，心流需要清晰的目标和及时的反馈，被打断后这两样都要重新建立。
        </p>
      </div>
      <div className="px-4 pb-4">
        <div className="border-line-1 flex items-center gap-2 rounded-[16px] border py-2 pr-2 pl-3.5">
          <span className="text-ink-3 text-tau-sm flex-1">围绕这些资料提问…</span>
          <span className="bg-accent text-ink-inverse grid size-[28px] place-items-center rounded-[10px]">
            <ArrowUp className="size-4" strokeWidth={2} />
          </span>
        </div>
      </div>
    </div>
  );

  return (
    <AppWindow active="vibe-learning" crumb="Notebook / 专注与深度工作" height={430}>
      <div className="flex h-full">
        <aside className="w-[210px] shrink-0 px-2.5 py-3 max-sm:hidden">
          <div className="text-tau-sm flex h-[30px] items-center gap-1 px-1 font-semibold">
            <ChevronDown className="text-ink-3 size-3.5" strokeWidth={1.75} />
            资料 <span className="text-ink-3 font-normal">{RESOURCES.length}</span>
            <Plus className="text-ink-3 ml-auto size-3.5" strokeWidth={1.75} />
          </div>
          {RESOURCES.map(resource => {
            const Icon = resource.icon;
            return (
              <button
                key={resource.id}
                type="button"
                onClick={() => setOpenId(openId === resource.id ? null : resource.id)}
                className={cn(
                  row,
                  "w-full text-left",
                  openId === resource.id ? "bg-selected text-ink-1" : "text-ink-2 hover:bg-hover"
                )}
              >
                <Icon className="size-3.5 shrink-0" strokeWidth={1.75} />
                <span className="truncate">{resource.title}</span>
              </button>
            );
          })}
          <div className="text-tau-sm mt-3 flex h-[30px] items-center gap-1 px-1 font-semibold">
            <ChevronDown className="text-ink-3 size-3.5" strokeWidth={1.75} />
            产物 <span className="text-ink-3 font-normal">{outputs.length}</span>
            <Plus className="text-ink-3 ml-auto size-3.5" strokeWidth={1.75} />
          </div>
          {outputs.map(output => {
            const Icon = output.icon;
            const pending = output.status === "生成中";
            return (
              <div key={output.id} className={cn(row, "text-ink-2 animate-doc-in")}>
                <Icon className="size-3.5 shrink-0" strokeWidth={1.75} />
                <span className="min-w-0 flex-1 truncate">{output.title}</span>
                <span
                  className={cn(
                    "text-[11px] whitespace-nowrap",
                    pending ? "text-accent-text animate-pulse" : "text-ink-3"
                  )}
                >
                  {output.status}
                </span>
              </div>
            );
          })}
        </aside>

        {opened ? (
          <>
            <section key={opened.id} className="animate-doc-in flex min-w-0 flex-1 flex-col">
              <div className="scrollbar-hide flex-1 overflow-y-auto px-7 pt-6">
                <p className="text-ink-3 text-tau-tiny flex items-center gap-1.5">
                  <BookOpen className="size-3" strokeWidth={1.75} />
                  资料
                </p>
                <h4 className="text-tau-title mt-1.5 font-semibold">{opened.title}</h4>
                <p className="text-tau-body mt-3 leading-[1.85]">{opened.body}</p>
              </div>
              <div className="border-line-2 flex flex-wrap items-center gap-1.5 border-t px-5 py-2.5">
                <span className="text-ink-3 text-tau-sm mr-1">基于这份资料</span>
                {KINDS.map(kind => {
                  const Icon = kind.icon;
                  return (
                    <button
                      key={kind.label}
                      type="button"
                      onClick={() => generate(kind)}
                      className="border-line-1 hover:border-accent hover:text-accent-text text-tau-sm flex h-7 items-center gap-1 rounded-full border px-2.5 transition-colors"
                    >
                      <Icon className="size-3.5" strokeWidth={1.75} />
                      {kind.label}
                    </button>
                  );
                })}
              </div>
            </section>
            <section className="w-[260px] shrink-0 shadow-[inset_1px_0_0_var(--tau-line-2)] max-md:hidden">
              {chat}
            </section>
          </>
        ) : (
          <section className="min-w-0 flex-1">{chat}</section>
        )}
      </div>
    </AppWindow>
  );
}
