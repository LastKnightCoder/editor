/**
 * 列表驾驶舱（原 features/projects/views/ProjectsView.tsx，拆模块后由项目 / 数据库 / Vibe Learning 共用）：
 * 工具栏（标题 + 摘要 + 排序 + 视图 + 新建）→ 网格时「最近打开」续读行 → 「全部」（网格卡或行式列表，
 * 置顶始终在前）→ 底部归档折叠段（沿用当前排布）。排布与排序按模块存本机偏好（D-092）。
 *
 * 一整张纸（同 Skill 页）：纸顶固定工具栏，纸内 FadeScroll 只装段落
 * （sticky 段头纸色实底 + 底缘渐透）。新建只有一个入口。无页内搜索（D-024 口径：
 * 语义检索走全局 Ctrl+K，空态引导同一入口）。
 */

import { useMemo, useState, type ReactNode } from "react";
import { ChevronDown, Plus } from "lucide-react";
import { FadeScroll } from "@tau/ui";
import { Button, ConfirmDialog, Loading, cn, toast } from "@tau/ui";
import { CockpitGridCard, CockpitListRows, CockpitRecentCard } from "./EntityCards";
import { CockpitToolbar } from "./CockpitToolbar";
import { EntityDialog } from "./EntityDialog";
import {
  COCKPIT_SORTS,
  recentCockpitItems,
  sortCockpitItems,
  type CockpitLayout,
  type CockpitSort,
} from "./model";
import { useCockpitPrefs } from "./prefs";
import type {
  CockpitCardHandlers,
  CockpitCopy,
  CockpitItem,
  CockpitMutations,
  CockpitVisual,
} from "./types";

export interface EntityCockpitProps {
  /** 本机偏好（排布 / 排序）的分区键，每个模块一个 */
  prefsKey: string;
  items: CockpitItem[];
  loading: boolean;
  visual: CockpitVisual;
  copy: CockpitCopy;
  mutations: CockpitMutations;
  /** 打开条目（宿主负责 navigator.push 到本模块的详情页） */
  onOpen(id: number): void;
  /** 新建成功后的去向，默认不跳转 */
  onCreated?(created: { id: number }): void;
  /** 整体导出弹窗（仅项目支持，其余模块不传则菜单项隐去） */
  renderExport?: (item: CockpitItem, close: () => void) => ReactNode;
}

export function EntityCockpit({
  prefsKey,
  items,
  loading,
  visual,
  copy,
  mutations,
  onOpen,
  onCreated,
  renderExport,
}: EntityCockpitProps) {
  const { layout, sort, setLayout, setSort } = useCockpitPrefs(prefsKey);
  const [archivedOpen, setArchivedOpen] = useState(false);

  /* 弹层状态：新建 / 编辑 / 删除确认 / 整体导出（只保留在当前页面） */
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<CockpitItem | null>(null);
  const [deleting, setDeleting] = useState<CockpitItem | null>(null);
  const [deletingBusy, setDeletingBusy] = useState(false);
  const [exporting, setExporting] = useState<CockpitItem | null>(null);

  /* ---------- 派生：最近打开、全部、归档 ---------- */

  const { recent, active, archived } = useMemo(() => {
    const activeItems = items.filter(item => !item.archived);
    return {
      recent: recentCockpitItems(activeItems),
      active: sortCockpitItems(activeItems, sort),
      archived: sortCockpitItems(
        items.filter(item => item.archived),
        sort
      ),
    };
  }, [items, sort]);

  const metricTotal = active.reduce((sum, item) => sum + item.metric, 0);
  const sortLabel = COCKPIT_SORTS.find(s => s.value === sort)?.label ?? "";

  /* ---------- 卡片操作 ---------- */

  const handlers: CockpitCardHandlers = {
    onOpen: item => onOpen(item.id),
    onTogglePin: item => void mutations.togglePin(item.id, !item.pinned),
    onSetArchived: (item, next) => void mutations.setArchived(item.id, next),
    onEdit: item => setEditing(item),
    onExport: renderExport ? item => setExporting(item) : undefined,
    onDelete: item => setDeleting(item),
  };

  const openCreate = () => setCreateOpen(true);

  if (loading) return <Loading />;

  const total = items.length;
  const collection = (list: CockpitItem[], showHead = true) => (
    <ItemCollection
      items={list}
      layout={layout}
      sort={sort}
      onSort={setSort}
      visual={visual}
      copy={copy}
      handlers={handlers}
      showHead={showHead}
    />
  );

  return (
    <div className="@container mx-auto flex h-full min-h-0 w-full max-w-[1720px] flex-col px-4 pb-4 pt-1">
      {/* 一整张纸：工具栏固定在纸顶，段落在纸内滚动 */}
      <div className="bg-surface shadow-card rounded-tau-lg flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="flex flex-none flex-col px-8 pt-5">
          {/* 工具栏：标题 + 摘要 + 排序 / 视图 + 唯一的「新建」 */}
          <div className="flex h-10 flex-none items-center gap-3.5">
            <h1 className="text-tau-title-lg shrink-0 whitespace-nowrap font-semibold tracking-[-0.01em]">
              {copy.title}
            </h1>
            <span className="text-tau-meta text-ink-2 w-0 flex-1 truncate whitespace-nowrap tabular-nums">
              <b className="text-ink-1 font-semibold">{active.length}</b> {copy.entityUnit}
              <span className="text-ink-3 mx-1.5">·</span>
              <b className="text-ink-1 font-semibold">{metricTotal}</b> {copy.metricUnit}
              {archived.length > 0 && ` · 已归档 ${archived.length}`}
            </span>
            {total > 0 && (
              <CockpitToolbar
                layout={layout}
                sort={sort}
                onLayoutChange={setLayout}
                onSortChange={setSort}
              />
            )}
            <Button
              variant="primary"
              size="sm"
              icon={Plus}
              className="shrink-0 whitespace-nowrap"
              onClick={openCreate}
            >
              {copy.createLabel}
            </Button>
          </div>
        </div>

        {/* 滚动区：FadeScroll（右侧 6px 透明边 + pr-[26px] = 左侧 pl-8）；
          不留 pt：段头贴滚动区顶边，scrollTop=0 起即处于吸顶位，滚动时不抖。
          首行卡片 hover 的 lift 阴影由段头的 pb 留白承接，不会被顶边裁掉 */}
        <FadeScroll topFade={false} className="mb-4 min-h-0 flex-1 pb-2 pl-8 pr-[26px]">
          {/* 最近打开：只在网格时出现；列表由「上次打开」列承担 */}
          {layout === "grid" && recent.length > 0 && (
            <section className="mb-[26px]">
              <CockpitSectionHead label="最近打开" hint={copy.recentHint} />
              <div className="grid grid-cols-3 gap-3">
                {recent.map(item => (
                  <CockpitRecentCard
                    key={item.id}
                    item={item}
                    visual={visual}
                    copy={copy}
                    onOpen={handlers.onOpen}
                  />
                ))}
              </div>
            </section>
          )}

          {active.length > 0 && (
            <section className="mb-[26px]">
              <CockpitSectionHead
                label="全部"
                hint={`${active.length} ${copy.entityUnit} · 按${sortLabel}`}
              />
              {collection(active)}
            </section>
          )}

          {/* 归档：折叠段 */}
          {archived.length > 0 && (
            <section>
              <button
                type="button"
                onClick={() => setArchivedOpen(prev => !prev)}
                className="group/head sticky top-0 z-[2] flex w-full items-center gap-2.5 bg-[linear-gradient(180deg,var(--tau-bg-surface)_calc(100%_-_13px),transparent)] px-0.5 pb-[13px] pt-0.5 text-left"
              >
                <ChevronDown
                  className={cn(
                    "text-ink-3 ease-tau-out size-[13px] transition-transform duration-200",
                    archivedOpen ? "rotate-0" : "-rotate-90"
                  )}
                  strokeWidth={1.75}
                />
                <span className="group-hover/head:text-accent-text text-[16px] font-semibold tracking-[-0.01em]">
                  已归档
                </span>
                <span className="text-ink-3 text-[11.5px] tabular-nums">{archived.length} 个</span>
              </button>
              <div
                className={cn(
                  "ease-tau-out grid grid-rows-[0fr] transition-[grid-template-rows] duration-200",
                  archivedOpen && "grid-rows-[1fr]"
                )}
              >
                <div className="overflow-hidden">{collection(archived, false)}</div>
              </div>
            </section>
          )}

          {/* 空态 */}
          {total === 0 && (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
              <p className="text-ink-2 text-[15px] font-medium">{copy.emptyTitle}</p>
              <p className="text-ink-3 text-[12.5px]">{copy.emptyHint}</p>
              <div className="mt-3 flex gap-2">
                <Button variant="primary" size="sm" icon={Plus} onClick={openCreate}>
                  {copy.createLabel}
                </Button>
              </div>
            </div>
          )}
        </FadeScroll>
      </div>

      {/* 新建 / 编辑弹窗 */}
      <EntityDialog
        open={createOpen || editing !== null}
        item={editing}
        copy={copy}
        mutations={mutations}
        onClose={() => {
          setCreateOpen(false);
          setEditing(null);
        }}
        onCreated={onCreated}
      />

      {/* 删除影响文案由模块给出，与主进程的级联删除范围一致 */}
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={open => {
          if (!open) setDeleting(null);
        }}
        title={copy.deleteTitle}
        context={deleting?.title || `${copy.title} #${deleting?.id}`}
        description={copy.deleteDescription}
        impact={copy.deleteImpact}
        danger
        confirmText="删除"
        loading={deletingBusy}
        onConfirm={async () => {
          if (!deleting) return;
          setDeletingBusy(true);
          try {
            await mutations.remove(deleting.id);
            setDeleting(null);
            toast.success("已删除");
          } catch {
            toast.error("删除失败");
          } finally {
            setDeletingBusy(false);
          }
        }}
      />

      {exporting && renderExport?.(exporting, () => setExporting(null))}
    </div>
  );
}

function ItemCollection({
  items,
  layout,
  sort,
  onSort,
  visual,
  copy,
  handlers,
  showHead,
}: {
  items: CockpitItem[];
  layout: CockpitLayout;
  sort: CockpitSort;
  onSort(sort: CockpitSort): void;
  visual: CockpitVisual;
  copy: CockpitCopy;
  handlers: CockpitCardHandlers;
  showHead: boolean;
}) {
  if (layout === "list") {
    return (
      <CockpitListRows
        items={items}
        visual={visual}
        copy={copy}
        sort={sort}
        onSort={onSort}
        handlers={handlers}
        showHead={showHead}
      />
    );
  }
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-3">
      {items.map(item => (
        <CockpitGridCard
          key={item.id}
          item={item}
          visual={visual}
          copy={copy}
          sort={sort}
          handlers={handlers}
        />
      ))}
    </div>
  );
}

/* ---------- 段头（sticky 实底 + 底缘渐透，零横线） ----------
   上部纸色实底、底部 13px（= pb）渐透到透明：卡片滑到段头下是渐隐而非硬切。
   滚动区不能有 pt：sticky 以扣掉 padding 的内容盒为吸顶边界，顶边会留一条无遮挡
   的缝漏出卡片；用负 top 抵消又会让段头先随内容上移几像素再停住（抖一下） */

function CockpitSectionHead({ label, hint }: { label: string; hint: string }) {
  return (
    <header className="sticky top-0 z-[2] flex items-baseline gap-3 bg-[linear-gradient(180deg,var(--tau-bg-surface)_calc(100%_-_13px),transparent)] pb-[13px] pl-0.5 pt-0.5">
      <span className="text-[16px] font-semibold tracking-[-0.01em]">{label}</span>
      <span className="text-ink-3 text-[11.5px] tabular-nums">{hint}</span>
    </header>
  );
}
