/**
 * Skill 页（D-060 方案 B）：卡片库（我的 / 内置 / 关联目录）+ 右侧抽屉 + 添加弹窗；
 * 「编辑」推入整页编辑器（skill-edit）。卡片开关即时生效（停用 ⇄ 恢复原调用方式）。
 */

import { useMemo, useState } from "react";
import { FolderSymlink, Plus, Search, Sparkles } from "lucide-react";
import { Button, ConfirmDialog, FilterPill, Input, Switch, cn, toast } from "@tau/ui";
import { FadeScroll } from "@/components/FadeScroll";
import useSkillStore from "@/stores/useSkillStore";
import { useSkillItems, SOURCE_LABEL, type SkillItem } from "../useSkills";
import { ModeBadge, BudgetBar, SkillIcon, SourceTag, WarningText } from "../components/SkillVisual";
import { SkillDrawer } from "./SkillDrawer";
import { AddSkillDialog, type AddSkillTab } from "./AddSkillDialog";

// 卡片落在大纸上：细描边分隔，悬停轻抬（纸上再叠阴影卡会糊成一片）
const CARD =
  "border-line-1 ease-tau-out flex min-h-[132px] min-w-0 flex-col gap-2.5 rounded-[var(--tau-radius-lg)] border p-3.5 text-left " +
  "hover:shadow-lift hover:border-transparent transition-[box-shadow,border-color] duration-200 " +
  "focus-visible:shadow-[var(--tau-focus-ring)] focus-visible:outline-none";

type Filter = "all" | "enabled" | "manual" | "issues";

function SkillCard({
  item,
  active,
  onOpen,
}: {
  item: SkillItem;
  active: boolean;
  onOpen: () => void;
}) {
  const { skill } = item;
  const uses = item.usage?.count ?? 0;
  return (
    <article
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={e => {
        if (e.key === "Enter" && e.target === e.currentTarget) onOpen();
      }}
      className={cn(CARD, "cursor-pointer", active && "border-accent")}
    >
      <div className="flex items-start gap-2.5">
        <SkillIcon skill={skill} />
        <div className={cn("min-w-0 flex-1", !item.enabled && "opacity-60")}>
          <div className="truncate text-[13.5px] font-semibold">{skill.name}</div>
          <div className="mt-0.5 flex min-w-0 items-center gap-1.5">
            <SourceTag skill={skill} />
            <span className="font-tau-mono text-ink-3 truncate text-[11px]">
              {skill.folderName}
            </span>
          </div>
        </div>
        <span onClick={e => e.stopPropagation()} onKeyDown={e => e.stopPropagation()}>
          <Switch
            size="sm"
            aria-label={item.enabled ? `停用 ${skill.name}` : `启用 ${skill.name}`}
            checked={item.enabled}
            onCheckedChange={v => useSkillStore.getState().setEnabled(skill.folderName, v)}
          />
        </span>
      </div>
      <p
        className={cn(
          "text-tau-sm line-clamp-2 min-h-[2lh] leading-[1.55]",
          skill.description ? "text-ink-2" : "text-ink-3",
          !item.enabled && "opacity-60"
        )}
      >
        {skill.description || "没有描述"}
      </p>
      <div className="text-tau-sm text-ink-3 mt-auto flex min-w-0 items-center gap-2">
        <ModeBadge mode={item.mode} />
        {item.warning ? (
          <WarningText item={item} />
        ) : (
          <span className="ml-auto shrink-0 tabular-nums">
            {uses ? `用过 ${uses} 次` : "未使用"}
          </span>
        )}
      </div>
    </article>
  );
}

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-7">
      <h2 className="mb-2.5 flex items-baseline gap-2 px-0.5 text-[13.5px] font-semibold">
        {title}
        {hint && <small className="text-tau-sm text-ink-3 font-normal">{hint}</small>}
      </h2>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-3.5">{children}</div>
    </section>
  );
}

const matches = (item: SkillItem, q: string) =>
  item.skill.name.toLowerCase().includes(q) ||
  item.skill.folderName.toLowerCase().includes(q) ||
  item.skill.description.toLowerCase().includes(q);

const FILTERS: Record<Filter, (item: SkillItem) => boolean> = {
  all: () => true,
  enabled: item => item.enabled,
  manual: item => item.mode === "manual",
  issues: item => Boolean(item.warning),
};

export function SkillsView() {
  const { items, budget, loaded } = useSkillItems();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [adding, setAdding] = useState<AddSkillTab | null>(null);
  const [deleting, setDeleting] = useState<SkillItem | null>(null);

  const q = query.trim().toLowerCase();
  const shown = items.filter(i => FILTERS[filter](i) && (!q || matches(i, q)));
  const bySource = (source: SkillItem["source"]) => shown.filter(i => i.source === source);
  const openItem = useMemo(() => items.find(i => i.key === openKey) ?? null, [items, openKey]);
  const counts = {
    all: items.length,
    enabled: items.filter(FILTERS.enabled).length,
    manual: items.filter(FILTERS.manual).length,
    issues: items.filter(FILTERS.issues).length,
  };

  const mine = bySource("mine");
  const builtin = bySource("builtin");
  const linked = bySource("linked");
  const nothing = loaded && shown.length === 0;

  return (
    <div className="mx-auto flex h-full min-h-0 w-full max-w-[1720px] flex-col px-4 pb-4 pt-1">
      {/* 一整张纸：页头与筛选行固定在纸顶，卡片在纸内滚动（同微信读书页） */}
      <div className="bg-surface shadow-card rounded-tau-lg flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="flex flex-none flex-col px-8 pt-5">
          <div className="flex h-10 flex-none items-center gap-3">
            <h1 className="text-tau-title-lg shrink-0 whitespace-nowrap font-semibold tracking-[-0.01em]">
              Skill
            </h1>
            <span className="text-tau-meta text-ink-2 w-0 flex-1 truncate whitespace-nowrap tabular-nums">
              已启用 <b className="text-ink-1 font-semibold">{counts.enabled}</b> / {counts.all}
            </span>
            <Input
              size="sm"
              lead={Search}
              clearable
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Escape" && query) {
                  e.stopPropagation();
                  setQuery("");
                }
              }}
              placeholder="搜索 Skill"
              className="w-0"
              wrapperClassName="w-auto max-w-[240px] flex-[0_1_240px]"
            />
            <Button
              variant="secondary"
              size="sm"
              icon={FolderSymlink}
              className="shrink-0 whitespace-nowrap"
              onClick={() => setAdding("link")}
            >
              关联目录
            </Button>
            <Button
              variant="primary"
              size="sm"
              icon={Plus}
              className="shrink-0 whitespace-nowrap"
              onClick={() => setAdding("new")}
            >
              添加 Skill
            </Button>
          </div>

          <p className="text-tau-meta text-ink-2 mt-1 px-0.5">
            Skill 是一份说明文档，教 AI
            按你的方式完成特定任务。「自动」只把描述放进对话、需要时才读全文；「仅手动」只在输入框用
            <kbd className="font-tau-mono text-ink-1 mx-0.5">$</kbd>点名时生效。
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2 px-0.5 pb-3">
            <FilterPill
              variant="raised"
              active={filter === "all"}
              onClick={() => setFilter("all")}
              label="全部"
              count={counts.all}
            />
            <FilterPill
              variant="raised"
              active={filter === "enabled"}
              onClick={() => setFilter("enabled")}
              label="已启用"
              count={counts.enabled}
            />
            <FilterPill
              variant="raised"
              active={filter === "manual"}
              onClick={() => setFilter("manual")}
              label="仅手动"
              count={counts.manual}
            />
            {counts.issues > 0 && (
              <FilterPill
                variant="raised"
                active={filter === "issues"}
                onClick={() => setFilter("issues")}
                label="需要处理"
                count={counts.issues}
                className={filter === "issues" ? undefined : "text-warn"}
              />
            )}
            <BudgetBar {...budget} className="ml-auto w-[420px] max-w-full" />
          </div>
        </div>

        <FadeScroll className="mb-4 min-h-0 flex-1 pb-2 pl-8 pr-[26px] pt-3">
          {(mine.length > 0 || (!q && filter === "all")) && (
            <Section title={SOURCE_LABEL.mine} hint={mine.length ? String(mine.length) : undefined}>
              {mine.map(item => (
                <SkillCard
                  key={item.key}
                  item={item}
                  active={item.key === openKey}
                  onOpen={() => setOpenKey(item.key)}
                />
              ))}
              {!q && filter === "all" && (
                <button
                  type="button"
                  onClick={() => setAdding("new")}
                  className="border-line-1 text-ink-3 hover:bg-hover hover:text-ink-1 flex min-h-[132px] flex-col items-center justify-center gap-1.5 rounded-[var(--tau-radius-lg)] border border-dashed transition-[background,color] duration-150"
                >
                  <Plus className="size-5" strokeWidth={1.5} />
                  <span className="text-tau-meta">新建 Skill</span>
                  {mine.length === 0 && (
                    <span className="text-tau-sm text-ink-3">
                      从模板开始、让 AI 起草，或导入现成的
                    </span>
                  )}
                </button>
              )}
            </Section>
          )}

          {builtin.length > 0 && (
            <Section title={SOURCE_LABEL.builtin} hint="随应用更新，可停用、可复制后修改">
              {builtin.map(item => (
                <SkillCard
                  key={item.key}
                  item={item}
                  active={item.key === openKey}
                  onOpen={() => setOpenKey(item.key)}
                />
              ))}
            </Section>
          )}

          {linked.length > 0 && (
            <Section title={SOURCE_LABEL.linked} hint="其它 AI 工具的 skills 目录 · 只读">
              {linked.map(item => (
                <SkillCard
                  key={item.key}
                  item={item}
                  active={item.key === openKey}
                  onOpen={() => setOpenKey(item.key)}
                />
              ))}
            </Section>
          )}

          {nothing && (
            <div className="flex flex-col items-center gap-2 px-5 py-20 text-center">
              <span className="bg-accent-soft text-accent-text mb-1.5 grid size-[52px] place-items-center rounded-[16px]">
                <Sparkles className="size-6" strokeWidth={1.5} />
              </span>
              <p className="text-ink-1 text-[15px] font-semibold">没有符合条件的 Skill</p>
              <Button
                variant="secondary"
                size="sm"
                className="mt-2"
                onClick={() => {
                  setQuery("");
                  setFilter("all");
                }}
              >
                清除筛选
              </Button>
            </div>
          )}
        </FadeScroll>
      </div>

      <SkillDrawer item={openItem} onClose={() => setOpenKey(null)} onDelete={setDeleting} />

      <AddSkillDialog tab={adding} onTabChange={setAdding} />

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={open => !open && setDeleting(null)}
        title="删除 Skill"
        context={deleting?.skill.name}
        description="整个 Skill 文件夹会移到废纸篓，可以从那里恢复。"
        confirmText="删除"
        danger
        onConfirm={async () => {
          if (!deleting) return;
          try {
            await useSkillStore.getState().deleteSkill(deleting.skill);
            if (openKey === deleting.key) setOpenKey(null);
            toast.success("已移到废纸篓");
          } catch (error) {
            toast.error((error as Error).message);
          }
          setDeleting(null);
        }}
      />
    </div>
  );
}
