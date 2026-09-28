/**
 * 列表驾驶舱（原 features/projects/views/ProjectsView.tsx，方案 C 定稿
 * mockups/projects/plan-c-cockpit.html，拆模块后由项目 / 数据库 / Vibe Learning 共用）：
 * 首屏「置顶」升格 hero 大卡（置顶全部、更新序；无置顶整段不渲染；被升格条目仍在下方
 * 全部网格——hero 是入口的放大不是分流）→「全部」紧凑网格 → 底部归档折叠段。
 *
 * 一整张纸（同 Skill 页）：纸顶固定工具栏，纸内 FadeScroll 只装段落
 * （sticky 段头纸色实底 + 底缘渐透）。新建只有一个入口。无页内搜索（D-024 口径：
 * 语义检索走全局 Ctrl+K，空态引导同一入口）、无排序 UI（默认「置顶 → 更新时间」序）。
 */

import { useMemo, useState } from "react";
import { ChevronDown, Plus } from "lucide-react";
import { FadeScroll } from "@/components/FadeScroll";
import { Button, ConfirmDialog, Loading, cn, toast } from "@tau/ui";
import { EntityHeroCard, EntityMiniCard } from "./EntityCards";
import { EntityDialog } from "./EntityDialog";
import type {
  CockpitCardHandlers,
  CockpitCopy,
  CockpitItem,
  CockpitMutations,
  CockpitVisual,
} from "./types";

export interface EntityCockpitProps {
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
  renderExport?: (item: CockpitItem, close: () => void) => React.ReactNode;
}

export function EntityCockpit({
  items,
  loading,
  visual,
  copy,
  mutations,
  onOpen,
  onCreated,
  renderExport,
}: EntityCockpitProps) {
  const [archivedOpen, setArchivedOpen] = useState(false);

  /* 弹层状态：新建 / 编辑 / 删除确认 / 整体导出（只保留在当前页面） */
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<CockpitItem | null>(null);
  const [deleting, setDeleting] = useState<CockpitItem | null>(null);
  const [deletingBusy, setDeletingBusy] = useState(false);
  const [exporting, setExporting] = useState<CockpitItem | null>(null);

  /* ---------- 派生：置顶段与全部网格 ---------- */

  const { heroes, rest, archived } = useMemo(() => {
    const active = items.filter(item => !item.archived);
    const byUpdate = [...active].sort((a, b) => b.updateTime - a.updateTime);
    return {
      /* 置顶段 = 置顶条目升格 hero（全部，更新序）；无置顶整段不渲染，
         最近条目由「全部」网格首行承接 */
      heroes: byUpdate.filter(item => item.pinned),
      /* 「升格不分流」：全部网格仍含置顶的 mini 卡（完整索引），按更新序 */
      rest: byUpdate,
      archived: items.filter(item => item.archived),
    };
  }, [items]);

  const metricTotal = rest.reduce((sum, item) => sum + item.metric, 0);

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

  return (
    <div className="@container mx-auto flex h-full min-h-0 w-full max-w-[1720px] flex-col px-4 pb-4 pt-1">
      {/* 一整张纸：工具栏固定在纸顶，段落在纸内滚动 */}
      <div className="bg-surface shadow-card rounded-tau-lg flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="flex flex-none flex-col px-8 pt-5">
          {/* 工具栏：标题 + 摘要（原底部状态栏的读数）+ 唯一的「新建」 */}
          <div className="flex h-10 flex-none items-center gap-3.5">
            <h1 className="text-tau-title-lg shrink-0 whitespace-nowrap font-semibold tracking-[-0.01em]">
              {copy.title}
            </h1>
            <span className="text-tau-meta text-ink-2 w-0 flex-1 truncate whitespace-nowrap tabular-nums">
              <b className="text-ink-1 font-semibold">{rest.length}</b> {copy.entityUnit}
              <span className="text-ink-3 mx-1.5">·</span>
              <b className="text-ink-1 font-semibold">{metricTotal}</b> {copy.metricUnit}
              {archived.length > 0 && ` · 已归档 ${archived.length}`}
            </span>
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
          {/* 置顶：升格 hero（无置顶不渲染） */}
          {heroes.length > 0 && (
            <section className="mb-[26px]">
              <SectionHead
                label="置顶"
                hint={`${heroes.length} ${copy.entityUnit} · ${heroes.reduce((sum, item) => sum + item.metric, 0)} ${copy.metricUnit}`}
              />
              <div className="grid grid-cols-[repeat(auto-fill,minmax(360px,1fr))] gap-3.5">
                {heroes.map(item => (
                  <EntityHeroCard
                    key={item.id}
                    item={item}
                    visual={visual}
                    copy={copy}
                    handlers={handlers}
                  />
                ))}
              </div>
            </section>
          )}

          {/* 全部：紧凑网格 */}
          {rest.length > 0 && (
            <section className="mb-[26px]">
              <SectionHead
                label="全部"
                hint={`${rest.length} ${copy.entityUnit} · ${metricTotal} ${copy.metricUnit}`}
              />
              <div className="grid grid-cols-[repeat(auto-fill,minmax(268px,1fr))] gap-2.5">
                {rest.map(item => (
                  <EntityMiniCard
                    key={item.id}
                    item={item}
                    visual={visual}
                    copy={copy}
                    handlers={handlers}
                  />
                ))}
              </div>
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
                <div className="overflow-hidden">
                  <div className="grid grid-cols-[repeat(auto-fill,minmax(268px,1fr))] gap-2.5">
                    {archived.map(item => (
                      <EntityMiniCard
                        key={item.id}
                        item={item}
                        visual={visual}
                        copy={copy}
                        handlers={handlers}
                      />
                    ))}
                  </div>
                </div>
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

/* ---------- 段头（sticky 实底 + 底缘渐透，零横线） ----------
   上部纸色实底、底部 13px（= pb）渐透到透明：卡片滑到段头下是渐隐而非硬切。
   滚动区不能有 pt：sticky 以扣掉 padding 的内容盒为吸顶边界，顶边会留一条无遮挡
   的缝漏出卡片；用负 top 抵消又会让段头先随内容上移几像素再停住（抖一下） */

function SectionHead({ label, hint }: { label: string; hint: string }) {
  return (
    <header className="sticky top-0 z-[2] flex items-baseline gap-3 bg-[linear-gradient(180deg,var(--tau-bg-surface)_calc(100%_-_13px),transparent)] pb-[13px] pl-0.5 pt-0.5">
      <span className="text-[16px] font-semibold tracking-[-0.01em]">{label}</span>
      <span className="text-ink-3 text-[11.5px] tabular-nums">{hint}</span>
    </header>
  );
}
