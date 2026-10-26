/**
 * 发布：左边按类型勾选要公开的内容，右边「本次发布」列出上传 / 删除，点「发布」走完
 * 准备 · 生成 · 推送 · 清理 · 完成。第一次全量上传；之后只传变化的文件，没变的计为跳过，
 * 取消勾选的内容在计划里显示为删除。结构按 features/publish 的 PublishView、RailCards
 * 与 components/PublishSelector 的 TypeRail 重建。
 */
import { useEffect, useMemo, useState } from "react";
import {
  Check,
  ExternalLink,
  FileText,
  FolderKanban,
  Globe,
  Layers,
  RotateCw,
  Upload,
} from "lucide-react";
import { Checkbox, cn } from "@tau/ui";
import { AppWindow } from "../AppWindow.tsx";

type Kind = "article" | "card";

const ITEMS: { id: number; title: string; kind: Kind; meta: string }[] = [
  { id: 1, title: "Deep Work 读书笔记", kind: "article", meta: "10 月 18 日" },
  {
    id: 2,
    title: "为什么你总是很忙却没做成事",
    kind: "article",
    meta: "10 月 9 日",
  },
  {
    id: 3,
    title: "用间隔重复学一门新语言",
    kind: "article",
    meta: "9 月 27 日",
  },
  { id: 4, title: "第三季度复盘", kind: "article", meta: "9 月 30 日" },
];

const TYPES = [
  {
    key: "card",
    label: "卡片",
    icon: Layers,
    tile: "bg-tag-1-soft text-tag-1",
    total: 128,
    selected: 6,
  },
  {
    key: "article",
    label: "文章",
    icon: FileText,
    tile: "bg-tag-2-soft text-tag-2",
    total: 24,
    selected: 0,
  },
  {
    key: "project",
    label: "项目",
    icon: FolderKanban,
    tile: "bg-tag-4-soft text-tag-4",
    total: 3,
    selected: 0,
  },
];

const STEPS = ["准备", "生成", "推送", "清理", "完成"];
/** 每篇文章生成的文件数；共享文件（首页、样式、搜索索引）固定 14 个 */
const PER_ITEM = 3;
const SHARED = 14;

export default function PublishDemo() {
  const [picked, setPicked] = useState<Set<number>>(new Set([1, 2]));
  /** 上一次发布时勾选的内容；null = 从未发布 */
  const [published, setPublished] = useState<Set<number> | null>(null);
  const [step, setStep] = useState(-1);

  useEffect(() => {
    if (step < 0 || step >= STEPS.length - 1) return;
    const timer = setTimeout(() => {
      // 最后一步时记下这次发布的勾选，下一次计划据此比对
      if (step === STEPS.length - 2) setPublished(new Set(picked));
      setStep(step + 1);
    }, 550);
    return () => clearTimeout(timer);
  }, [step, picked]);

  const plan = useMemo(() => {
    if (!published) return { upload: picked.size * PER_ITEM + SHARED, remove: 0, skip: 0 };
    const added = [...picked].filter(id => !published.has(id)).length;
    const removed = [...published].filter(id => !picked.has(id)).length;
    const kept = [...picked].filter(id => published.has(id)).length;
    // 增删内容会让首页与搜索索引变化，其余共享文件不变
    const sharedChanged = added + removed > 0 ? 3 : 0;
    return {
      upload: added * PER_ITEM + sharedChanged,
      remove: removed * PER_ITEM,
      skip: kept * PER_ITEM + SHARED - sharedChanged,
    };
  }, [picked, published]);

  const [result, setResult] = useState(plan);
  const running = step >= 0 && step < STEPS.length - 1;
  const done = step === STEPS.length - 1;

  const toggle = (id: number) => {
    if (running) return;
    setStep(-1);
    setPicked(set => {
      const next = new Set(set);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <AppWindow active="publish" crumb="发布" height={440}>
      <div className="flex h-full flex-col">
        <header className="border-line-1 flex shrink-0 items-center gap-3.5 border-b px-7 pt-4 pb-3.5 max-sm:px-4">
          <span className="bg-hover text-ink-3 grid size-11 place-items-center rounded-[12px]">
            <Globe className="size-[22px]" strokeWidth={1.75} />
          </span>
          <div className="min-w-0">
            <b className="text-tau-title-lg block truncate font-semibold">慢慢想</b>
            <div className="text-tau-sm text-ink-3 mt-0.5 flex flex-wrap items-center gap-2.5">
              <span className="font-tau-mono text-accent-text text-[11.5px]">
                linxia.github.io/notes
              </span>
              <span className="bg-hover text-ink-2 text-tau-micro inline-flex items-center gap-1.5 rounded-full px-[9px] py-px">
                <i className="bg-ok size-1.5 rounded-full" />
                GitHub Pages
              </span>
              <span>{published ? "上次发布 刚刚" : "从未发布"}</span>
            </div>
          </div>
        </header>

        <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_250px] max-md:grid-cols-1">
          <div className="flex min-h-0">
            <nav className="flex w-[150px] shrink-0 flex-col gap-0.5 py-3 pr-1.5 pl-3 max-sm:hidden">
              <span className="text-ink-1 px-2 pb-2 text-[13px] font-semibold">
                发布内容
                <span className="text-ink-3 ml-2 font-mono text-[11px] font-normal tabular-nums">
                  {picked.size + 6} 项
                </span>
              </span>
              {TYPES.map(type => {
                const Icon = type.icon;
                const active = type.key === "article";
                const selected = type.key === "article" ? picked.size : type.selected;
                return (
                  <span
                    key={type.key}
                    className={cn(
                      "flex items-center gap-2.5 rounded-[10px] px-[9px] py-2",
                      active && "bg-selected"
                    )}
                  >
                    <span
                      className={cn("grid size-[26px] place-items-center rounded-[8px]", type.tile)}
                    >
                      <Icon className="size-3.5" strokeWidth={1.75} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span
                        className={cn(
                          "block text-[13px]",
                          active ? "text-accent-text font-semibold" : "text-ink-1 font-medium"
                        )}
                      >
                        {type.label}
                      </span>
                      <span className="text-ink-3 block font-mono text-[11px] tabular-nums">
                        {selected} / {type.total}
                      </span>
                    </span>
                  </span>
                );
              })}
            </nav>
            <div className="scrollbar-hide min-w-0 flex-1 overflow-y-auto px-4 py-3">
              {ITEMS.map(item => {
                const on = picked.has(item.id);
                return (
                  <label
                    key={item.id}
                    className="hover:bg-hover flex h-11 cursor-pointer items-center gap-3 rounded-[9px] px-2"
                  >
                    <Checkbox checked={on} disabled={running} onChange={() => toggle(item.id)} />
                    <span
                      className={cn("text-tau-body min-w-0 flex-1 truncate", !on && "text-ink-2")}
                    >
                      {item.title}
                    </span>
                    <span className="text-ink-3 text-tau-tiny tabular-nums">{item.meta}</span>
                  </label>
                );
              })}
            </div>
          </div>

          <aside className="border-line-1 divide-line-1 flex flex-col divide-y border-l max-md:hidden">
            <section className="px-5 py-4">
              <p className="text-tau-body flex items-center gap-2 font-semibold">
                本次发布
                <span className="text-ink-3 text-tau-tiny font-normal">全量生成并推送</span>
                <span className="text-ink-3 text-tau-tiny ml-auto inline-flex items-center gap-1 font-normal">
                  <RotateCw className="size-3" strokeWidth={2} />
                  重新计算
                </span>
              </p>
              <div className="bg-track mt-3 mb-3 flex h-2 gap-0.5 overflow-hidden rounded-full">
                {plan.upload > 0 && (
                  <i className="bg-accent block h-full" style={{ flex: plan.upload }} />
                )}
                {plan.remove > 0 && (
                  <i className="bg-danger block h-full" style={{ flex: plan.remove }} />
                )}
              </div>
              <p className="text-tau-sm flex items-center gap-2">
                <i className="bg-accent size-2 rounded-full" />
                上传文件
                <span className="text-ink-2 ml-auto tabular-nums">{plan.upload}</span>
              </p>
              <p
                className={cn(
                  "text-tau-sm mt-1 flex items-center gap-2",
                  plan.remove === 0 && "text-ink-3"
                )}
              >
                <i className="bg-danger size-2 rounded-full" />
                删除（已取消勾选）
                <span className="ml-auto tabular-nums">{plan.remove}</span>
              </p>
            </section>

            <section className="flex flex-1 flex-col px-5 py-4">
              {done ? (
                <>
                  <p className="text-tau-body font-semibold">发布完成</p>
                  <div className="bg-ok-soft animate-doc-in mt-2.5 flex items-start gap-2.5 rounded-[11px] p-3">
                    <span className="bg-ok text-ink-inverse grid size-[26px] flex-none place-items-center rounded-full">
                      <Check className="size-3.5" strokeWidth={2.5} />
                    </span>
                    <span className="min-w-0">
                      <b className="text-[13px] font-semibold">{result.upload} 个文件已上传</b>
                      {(result.remove > 0 || result.skip > 0) && (
                        <span className="text-tau-sm text-ink-2 mt-0.5 block">
                          {[
                            result.remove > 0 && `${result.remove} 个旧文件已删除`,
                            result.skip > 0 && `${result.skip} 个跳过`,
                          ]
                            .filter(Boolean)
                            .join("，")}
                        </span>
                      )}
                    </span>
                  </div>
                  <span className="flex-1" />
                  <div className="mt-3 flex gap-2">
                    <button
                      type="button"
                      disabled={picked.size === 0}
                      onClick={() => {
                        setResult(plan);
                        setStep(0);
                      }}
                      className="bg-accent text-ink-inverse hover:bg-accent-hover flex h-8 flex-1 items-center justify-center gap-1.5 rounded-[9px] text-[13px] font-medium disabled:opacity-50"
                    >
                      <RotateCw className="size-3.5" strokeWidth={2} />
                      重新发布
                    </button>
                    <span className="border-line-1 flex h-8 flex-1 items-center justify-center gap-1.5 rounded-[9px] border text-[13px]">
                      <ExternalLink className="size-3.5" strokeWidth={1.75} />
                      访问站点
                    </span>
                  </div>
                </>
              ) : (
                <>
                  <p className="text-tau-body font-semibold">发布到 GitHub Pages</p>
                  {running ? (
                    <div className="animate-doc-in mt-3 flex flex-col gap-2">
                      <div className="bg-track h-1.5 overflow-hidden rounded-full">
                        <div
                          className="bg-accent ease-tau-out h-full rounded-full transition-[width] duration-500"
                          style={{
                            width: `${((step + 1) / STEPS.length) * 100}%`,
                          }}
                        />
                      </div>
                      <p className="text-ink-3 text-tau-tiny flex gap-1.5">
                        {STEPS.map((name, index) => (
                          <span
                            key={name}
                            className={cn(index <= step && "text-ink-1 font-medium")}
                          >
                            {name}
                          </span>
                        ))}
                      </p>
                      <p className="text-tau-micro text-ink-3">发布进行中，完成前请勿关闭应用</p>
                    </div>
                  ) : (
                    <p className="text-tau-sm text-ink-3 mt-0.5">GitHub Pages</p>
                  )}
                  <span className="flex-1" />
                  <button
                    type="button"
                    disabled={picked.size === 0 || running}
                    onClick={() => {
                      setResult(plan);
                      setStep(0);
                    }}
                    className="bg-accent text-ink-inverse hover:bg-accent-hover mt-3 flex h-10 w-full items-center justify-center gap-1.5 rounded-[11px] text-[14px] font-medium disabled:opacity-50"
                  >
                    <Upload className="size-4" strokeWidth={1.75} />
                    发布
                  </button>
                </>
              )}
            </section>
          </aside>
        </div>
      </div>
    </AppWindow>
  );
}
