/**
 * 发布页重建：结构摘自 features/publish/views/PublishView.tsx、RailCards.tsx 与 components/PublishSelector
 *（TypeRail / SearchToolbar / CardSelector / SelectionCheckbox）。右栏按阶段显示：就绪 → 正在发布（五步 + 进度条）→ 发布完成。
 */
import clsx from "clsx";
import { Check, ChevronRight, ExternalLink, Eye, FileText, Folder, Layers, MessageSquare, RotateCw, Search, Upload, type LucideIcon } from "lucide-react";
import { Button } from "@tau/ui";
import { Img, staticFile } from "remotion";
import { PUBLISH } from "../../mock/deepwork";

export type PublishState = {
  /** 第一行（这次新写的卡片）被勾上 */
  checked: boolean;
  /** 「发布」按钮按下 */
  pressed: boolean;
  /** 发布进度 0→1；undefined 为未开始 */
  progress?: number;
  done: boolean;
};

const TYPES: { label: string; desc: string; icon: LucideIcon; tile: string; count: [number, number] }[] = [
  { label: "卡片", desc: "按标签选择卡片", icon: Layers, tile: "bg-tag-1-soft text-tag-1", count: [128, 135] },
  { label: "文章", desc: "选择文章发布", icon: FileText, tile: "bg-tag-2-soft text-tag-2", count: [24, 26] },
  { label: "问题", desc: "按分类选择问题", icon: MessageSquare, tile: "bg-tag-3-soft text-tag-3", count: [9, 12] },
  { label: "项目", desc: "选择项目文档", icon: Folder, tile: "bg-tag-4-soft text-tag-4", count: [3, 5] },
];

const STEPS = ["准备", "生成", "推送", "清理", "完成"];

function Checkbox({ on }: { on: boolean }) {
  return (
    <span className={clsx("grid size-4 shrink-0 place-items-center rounded-[5px]", on ? "bg-accent text-white" : "bg-surface shadow-[inset_0_0_0_1.5px_var(--tau-bg-track)]")}>
      {on && <Check size={11} strokeWidth={3} />}
    </span>
  );
}

function Section({ children }: { children: React.ReactNode }) {
  return <section className="py-5 pr-[26px] pl-8">{children}</section>;
}

function Title({ children, note }: { children: React.ReactNode; note?: string }) {
  return (
    <div className="text-tau-body text-ink-1 flex items-center gap-2 font-semibold">
      {children}
      {note && <span className="text-tau-micro text-ink-3 truncate font-normal">{note}</span>}
    </div>
  );
}

export function PublishPage({ state }: { state: PublishState }) {
  const P = PUBLISH;
  const selected = P.selected + (state.checked ? 1 : 0);
  const publishing = state.progress !== undefined && !state.done;
  const stepIndex = Math.min(STEPS.length - 1, Math.floor((state.progress ?? 0) * STEPS.length));
  const files = Math.round((state.progress ?? 0) * P.files);
  return (
    <div className="mx-auto flex h-full min-h-0 w-full max-w-[1720px] flex-col px-4 pt-1 pb-4">
      <div className="bg-surface shadow-card rounded-tau-lg flex min-h-0 flex-1 flex-col overflow-hidden">
        <header className="border-line-1 flex flex-none items-center gap-3.5 border-b px-8 pt-5 pb-4">
          <span className="bg-hover text-ink-3 grid size-11 flex-none place-items-center overflow-hidden rounded-[12px]">
            <Img src={staticFile("tau-logo.png")} className="size-6" />
          </span>
          <div className="min-w-0">
            <h1 className="text-tau-title-lg truncate font-semibold tracking-[-0.01em]">{P.site}</h1>
            <div className="text-tau-sm text-ink-3 mt-0.5 flex flex-wrap items-center gap-2.5">
              <span className="font-tau-mono text-accent-text text-[11.5px]">{P.url}</span>
              <span className="text-tau-micro bg-hover text-ink-2 inline-flex items-center gap-1.5 rounded-full px-[9px] py-px">
                <i className="bg-ok size-1.5 rounded-full" />
                GitHub Pages · {P.branch}
              </span>
              <span>{state.done ? "上次发布 刚刚" : `上次发布 ${P.lastPublished}`}</span>
            </div>
          </div>
        </header>
        <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_360px]">
          <div className="flex min-h-0 overflow-hidden pl-5">
            <nav className="flex w-[204px] shrink-0 flex-col gap-0.5 py-3.5 pr-1.5 pl-3">
              <div className="mb-2 flex items-baseline justify-between px-[9px]">
                <span className="text-ink-1 text-[13px] font-semibold">发布内容</span>
                <span className="text-ink-3 font-mono text-[11px] tabular-nums">{selected} 项</span>
              </div>
              {TYPES.map((t, i) => (
                <span key={t.label} className={clsx("flex items-center gap-2.5 rounded-[10px] px-[9px] py-2", i === 0 && "bg-selected")}>
                  <span className={clsx("grid size-[26px] shrink-0 place-items-center rounded-[8px]", t.tile)}>
                    <t.icon size={14} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className={clsx("block truncate text-[13px]", i === 0 ? "text-accent-text font-semibold" : "text-ink-1 font-medium")}>{t.label}</span>
                    <span className="text-ink-3 block truncate text-[11px]">{t.desc}</span>
                  </span>
                  <span className="text-ink-2 shrink-0 font-mono text-[11.5px] font-medium tabular-nums">
                    {i === 0 ? t.count[0] + (state.checked ? 1 : 0) : t.count[0]}
                    <span className="text-ink-3">/{i === 0 ? t.count[1] + 1 : t.count[1]}</span>
                  </span>
                </span>
              ))}
              <div className="text-ink-3 mt-auto px-2 pt-2.5 pb-0.5 text-[11.5px] leading-[1.7]">勾选即保存，下次打开保持</div>
            </nav>
            <div className="border-line-1 flex min-w-0 flex-1 flex-col border-l">
              <div className="flex shrink-0 items-center gap-2 px-4 pt-3.5 pb-2">
                <div className="border-line-1 bg-surface text-ink-3 relative flex h-[30px] flex-1 items-center rounded-[8px] border pl-8 text-[12.5px]">
                  <Search className="absolute left-2.5 size-3.5" strokeWidth={1.75} />
                  搜索卡片标题或标签…
                </div>
                <div className="bg-hover flex shrink-0 rounded-[8px] p-[2px] text-[12px]">
                  {["全部", "已选", "未选"].map((s, i) => (
                    <span key={s} className={clsx("rounded-[6px] px-[11px] py-[3px]", i === 0 ? "bg-surface text-ink-1 shadow-card font-medium" : "text-ink-2")}>
                      {s}
                    </span>
                  ))}
                </div>
              </div>
              <div className="flex min-h-0 flex-1">
                <div className="w-48 shrink-0 py-2">
                  <div className="text-ink-3 px-3 pb-1.5 text-[11.5px] font-medium">标签</div>
                  {P.tags.map(([tag, count], i) => (
                    <div key={tag} className={clsx("flex items-center rounded-[8px] py-1.5 pr-2 pl-[10px] text-[13px]", i === 1 ? "bg-selected text-accent-text font-medium" : "text-ink-2")}>
                      <span className="min-w-0 flex-1 truncate">{tag}</span>
                      <span className="font-mono text-[11px] tabular-nums">{count}</span>
                    </div>
                  ))}
                </div>
                <div className="min-w-0 flex-1 px-2 py-2">
                  {P.cards.map((card, i) => (
                    <div key={card.title} className={clsx("flex items-center gap-2.5 rounded-[8px] px-2 py-1.5", i === 0 && state.checked && "bg-accent-soft")}>
                      <Checkbox on={i === 0 ? state.checked : card.on} />
                      <div className="min-w-0 flex-1">
                        <div className="text-ink-1 truncate text-[13px]">{card.title}</div>
                        <div className="text-tau-tiny text-ink-3 mt-0.5 truncate">{card.excerpt}</div>
                      </div>
                      <Eye className="text-ink-3 size-3.5 shrink-0" strokeWidth={1.75} />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
          <aside className="border-line-1 flex min-h-0 flex-col border-l">
            <div className="divide-line-1 flex min-h-0 flex-1 flex-col divide-y">
              {!publishing && !state.done && (
                <>
                  <Section>
                    <Title note="增量更新">本次发布</Title>
                    <div className="bg-track mt-3.5 mb-3 flex h-2 gap-0.5 overflow-hidden rounded-full">
                      <i className="bg-accent block h-full" style={{ flex: P.upload + (state.checked ? 1 : 0) }} />
                      <i className="block h-full" style={{ flex: 40 }} />
                    </div>
                    <div className="text-tau-meta flex items-center gap-2.5 rounded-[7px] px-1.5 py-[5px]">
                      <ChevronRight className="text-ink-3 size-3.5" strokeWidth={1.75} />
                      <i className="bg-accent size-2 rounded-[3px]" />
                      上传文件
                      <span className="font-tau-mono ml-auto text-[12.5px] font-semibold">{P.upload + (state.checked ? 1 : 0)}</span>
                    </div>
                  </Section>
                  <Section>
                    <Title>发布到 GitHub Pages</Title>
                    <div className="text-tau-sm text-ink-3 mt-0.5 truncate">
                      {P.repo} · {P.branch} · Git Push
                    </div>
                    <Button variant="primary" icon={Upload} className="mt-3.5 h-10 w-full justify-center rounded-[11px] text-[14px]" style={state.pressed ? { filter: "brightness(0.9)" } : undefined}>
                      发布
                    </Button>
                    <div className="text-tau-micro text-ink-3 mt-2.5 flex justify-between">
                      <span>重新生成全部页面并推送</span>
                      <span>测试连接</span>
                    </div>
                  </Section>
                </>
              )}
              {publishing && (
                <Section>
                  <Title note="推送到 gh-pages">正在发布</Title>
                  <div className="mt-4 mb-4 flex">
                    {STEPS.map((step, i) => (
                      <div
                        key={step}
                        className={clsx(
                          "relative flex flex-1 flex-col items-center gap-1.5 text-[11px]",
                          i < stepIndex ? "text-ink-2" : i === stepIndex ? "text-accent-text font-medium" : "text-ink-3"
                        )}
                      >
                        {i > 0 && <span className={clsx("absolute top-[5px] right-1/2 left-[-50%] h-0.5", i <= stepIndex ? "bg-accent" : "bg-track")} />}
                        <span className={clsx("relative size-3 rounded-full", i < stepIndex ? "bg-accent" : i === stepIndex ? "bg-surface ring-accent ring-[2.5px] ring-inset" : "bg-track")} />
                        {step}
                      </div>
                    ))}
                  </div>
                  <div className="bg-track h-1.5 overflow-hidden rounded-full">
                    <i className="bg-accent block h-full rounded-full" style={{ width: `${(state.progress ?? 0) * 100}%` }} />
                  </div>
                  <div className="text-tau-micro text-ink-3 mt-2 flex justify-between gap-3">
                    <span className="font-tau-mono text-ink-2 truncate">{P.currentFile}</span>
                    <span className="font-tau-mono flex-none">
                      {files} / {P.files}
                    </span>
                  </div>
                  <div className="text-tau-tiny text-ink-3 mt-3">发布进行中，完成前请勿关闭应用</div>
                </Section>
              )}
              {state.done && (
                <Section>
                  <Title note="刚刚 · 用时 4 秒">发布完成</Title>
                  <div className="bg-ok-soft mt-3 flex items-start gap-3 rounded-[11px] p-3">
                    <span className="text-ink-inverse bg-ok grid size-[26px] flex-none place-items-center rounded-full">
                      <Check size={14} strokeWidth={2.5} />
                    </span>
                    <div>
                      <b className="text-[13px] font-semibold">{P.files} 个文件已上传</b>
                      <p className="text-tau-sm text-ink-2 mt-0.5">0 个旧文件已删除，{P.skipped} 个跳过</p>
                    </div>
                  </div>
                  <div className="mt-3 flex gap-2">
                    <Button variant="primary" size="sm" icon={RotateCw} className="flex-1 justify-center">
                      重新发布
                    </Button>
                    <Button variant="secondary" size="sm" icon={ExternalLink} className="flex-1 justify-center">
                      访问站点
                    </Button>
                  </div>
                </Section>
              )}
              <Section>
                <div className="text-tau-body text-ink-1 flex items-center gap-2 font-semibold">
                  站点设置
                  <span className="text-tau-micro text-ink-3 font-normal">GitHub Pages</span>
                </div>
                {[
                  ["仓库", P.repo],
                  ["分支", P.branch],
                  ["方式", "Git Push"],
                  ["访问路径", "/"],
                ].map(([k, v]) => (
                  <div key={k} className="text-tau-sm flex items-baseline gap-3 py-[3px]">
                    <span className="text-ink-3 w-14">{k}</span>
                    <span className="font-tau-mono text-ink-2 flex-1 truncate text-right text-[11.5px]">{v}</span>
                  </div>
                ))}
              </Section>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
