/**
 * 知识地图页：卡片、文章、项目文档在同一张地图上，按「显式链接 + 语义近邻」分出主题。
 *
 * 一整张纸：纸顶是标题、统计与筛选（类型 pill + 项目菜单），其余铺满地图。筛选只降淡未命中的节点，
 * 不删节点。点节点在右侧 Drawer 预览（MapItemDrawer），在 Drawer 里再决定打开详情；
 * 带 focus 进入时镜头对准它并 accent 强调。
 *
 * 入场动画的时机见 milestones：这个库第一次进入地图时自动播一次；之后节点数跨过里程碑，
 * 左下角说明行换成邀请语，点了才播。
 *
 * 标题行右侧「✦ AI 洞见」进入洞见视图（insights/useMapInsights）：报告放在地图右侧的侧栏，标记画在地图的覆盖层上。
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, FolderKanban } from "lucide-react";
import { FilterPill, Menu, cn, toast } from "@tau/ui";
import LinkGraph, { type LinkGraphPlaybackHandle } from "@/components/LinkGraph";
import { normalizeEntityRefKind } from "@/entity/ref";
import type { KnowledgeMapItem, KnowledgeMapTopic } from "@/knowledge-map/types";
import type { KnowledgeEndpoint } from "@/types/knowledge-insights";
import { usePageParams } from "@/page/PageProvider";
import { openEntity } from "@/services/open-content";
import useSettingStore from "@/stores/useSettingStore";
import { graphMoment, milestoneOf, useGraphMilestoneStore } from "../milestones";
import {
  EMPTY_FILTER,
  KIND_LABEL,
  countByKind,
  filterHits,
  indexOfKey,
  placeLabel,
  toGraphItems,
  type MapFilter,
  type MapItemKind,
} from "../model";
import { useMapInsights } from "../insights/useMapInsights";
import { useKnowledgeMap } from "../queries";
import { MapItemDrawer, type MapPreview } from "./MapItemDrawer";

/** 等地图画出第一帧再自动播：刚挂载时画布尺寸与相机还没就绪 */
const AUTOPLAY_DELAY = 400;
const KINDS: MapItemKind[] = ["card", "article", "project-item"];
const EMPTY_TOPICS: KnowledgeMapTopic[] = [];

const previewOf = (items: KnowledgeMapItem[], key: string): MapPreview | null => {
  const item = items.find(entry => entry.key === key);
  return item ? { item } : null;
};

export function KnowledgeMapView() {
  const params = usePageParams<{ focus?: string; insight?: string }>();
  const query = useKnowledgeMap(true);
  const items = useMemo(() => query.data?.items ?? [], [query.data]);
  const graphItems = useMemo(() => toGraphItems(items), [items]);
  // 地图还在首次构建（大库要分钟级）时先画链接图谱：让用户能看能点，算完自动换上地图
  const graphShown = !(query.isPending && query.isFetching);

  const [filter, setFilter] = useState<MapFilter>(EMPTY_FILTER);
  const hits = useMemo(() => filterHits(items, filter), [items, filter]);
  const counts = useMemo(() => countByKind(items), [items]);
  const projects = useMemo(() => {
    const byId = new Map<number, { id: number; title: string; count: number }>();
    for (const item of items) {
      if (item.projectId === null || !item.projectTitle) continue;
      const entry = byId.get(item.projectId) ?? {
        id: item.projectId,
        title: item.projectTitle,
        count: 0,
      };
      entry.count += 1;
      byId.set(item.projectId, entry);
    }
    return [...byId.values()].sort((a, b) => b.count - a.count);
  }, [items]);
  const focusIndex = useMemo(() => indexOfKey(items, params.focus), [items, params.focus]);
  // 正在预览的节点：同 focus 一样 accent 强调；从洞见气泡点进来的带着要定位的块
  const [preview, setPreview] = useState<MapPreview | null>(null);
  const previewIndex = useMemo(() => indexOfKey(items, preview?.item.key), [items, preview]);
  const currentIds = useMemo(() => {
    const ids = [focusIndex, previewIndex].filter((id): id is number => id !== null);
    return ids.length ? ids : undefined;
  }, [focusIndex, previewIndex]);
  const openItem = ({ item, block }: MapPreview) => {
    const ref = normalizeEntityRefKind(item.kind);
    if (!ref) return;
    openEntity({ kind: ref, id: item.id }, block === undefined ? {} : { at: { block } }).catch(
      error => toast.error(error instanceof Error ? error.message : "无法打开内容")
    );
  };
  // 洞见气泡里点笔记：在地图上的进 Drawer 预览并定位到那一节；不在地图上的直接打开
  const previewEndpoint = (end: KnowledgeEndpoint) => {
    const item = items.find(entry => entry.key === `${end.ref.kind}:${end.ref.id}`);
    if (item) {
      setPreview({ item, block: end.block });
      return;
    }
    openEntity(end.ref, { at: { block: end.block } }).catch(error =>
      toast.error(error instanceof Error ? error.message : "无法打开内容")
    );
  };

  // ---- 生长动画的时机（每次进入地图页只判定一次）
  const databaseName = useSettingStore(state => state.setting.database.active);
  const seen = useGraphMilestoneStore(state => state.seenByDatabase[databaseName] ?? null);
  const markSeen = useGraphMilestoneStore(state => state.markSeen);
  const playbackRef = useRef<LinkGraphPlaybackHandle>(null);
  const [invite, setInvite] = useState<number | null>(null);
  const [autoplay, setAutoplay] = useState(false);
  const decidedRef = useRef(false);
  useEffect(() => {
    if (decidedRef.current || !graphShown || items.length === 0) return;
    decidedRef.current = true;
    // 带 focus 进来是为了看某篇内容在哪，不打断它去播动画
    if (focusIndex !== null) return;
    const moment = graphMoment(items.length, seen);
    if (moment.kind === "autoplay") {
      markSeen(databaseName, milestoneOf(items.length));
      setAutoplay(true);
    }
    if (moment.kind === "invite") setInvite(moment.milestone);
  }, [graphShown, items.length, seen, markSeen, databaseName, focusIndex]);

  // 自动播单独一个 effect：上面那个在 markSeen 后会因 seen 变化重跑，定时器放在那里会被清理
  useEffect(() => {
    if (!autoplay) return;
    const timer = setTimeout(() => {
      setAutoplay(false);
      playbackRef.current?.play();
    }, AUTOPLAY_DELAY);
    return () => clearTimeout(timer);
  }, [autoplay]);

  const captionHint = invite ? `长到 ${invite} 条了 · 看看它是怎么长出来的` : null;
  const insights = useMapInsights(query.data?.map?.topics ?? EMPTY_TOPICS, params.insight, {
    preview: previewEndpoint,
    placeOf: end => {
      const item = items.find(entry => entry.key === `${end.ref.kind}:${end.ref.id}`);
      return item ? placeLabel(item) : null;
    },
  });
  const currentProject = projects.find(project => project.id === filter.projectId) ?? null;
  const [projectMenuOpen, setProjectMenuOpen] = useState(false);

  return (
    <div className="mx-auto flex h-full min-h-0 w-full min-w-0 max-w-[1760px] flex-col px-4 pb-4 pt-1">
      <div className="bg-surface shadow-card rounded-tau-lg relative flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="mb-2 mt-5 flex h-10 flex-none items-center gap-3 px-8">
          <h1 className="text-tau-title-lg shrink-0 whitespace-nowrap font-semibold tracking-[-0.01em]">
            知识地图
          </h1>
          <span className="text-tau-meta text-ink-2 w-0 flex-1 truncate whitespace-nowrap tabular-nums">
            {KINDS.map(kind => `${KIND_LABEL[kind]} ${counts[kind]}`).join(" · ")}
          </span>
          {query.data?.map && insights.button}
        </div>
        <div className="flex flex-none items-center gap-1.5 px-8 pb-3">
          <FilterPill
            active={filter.kind === null}
            onClick={() => setFilter(current => ({ ...current, kind: null }))}
            label="全部"
          />
          {KINDS.map(kind => (
            <FilterPill
              key={kind}
              active={filter.kind === kind}
              onClick={() => setFilter(current => ({ ...current, kind }))}
              label={KIND_LABEL[kind]}
              count={counts[kind]}
            />
          ))}
          {projects.length > 0 && (
            <Menu
              open={projectMenuOpen}
              onOpenChange={setProjectMenuOpen}
              align="start"
              className="max-h-[360px] w-[220px] overflow-y-auto"
              trigger={
                <button
                  type="button"
                  className={cn(
                    "rounded-tau-sm ml-1.5 flex h-7 min-w-0 items-center gap-1.5 px-2 text-[12.5px] transition-colors",
                    currentProject
                      ? "bg-selected text-accent-text font-medium"
                      : "text-ink-2 hover:bg-hover hover:text-ink-1"
                  )}
                >
                  <FolderKanban className="size-[13px] shrink-0" strokeWidth={1.75} />
                  <span className="max-w-[160px] truncate">
                    {currentProject?.title ?? "全部项目"}
                  </span>
                  <ChevronDown className="size-3 shrink-0" strokeWidth={1.75} />
                </button>
              }
            >
              <Menu.Item
                onSelect={() => setFilter(current => ({ ...current, projectId: null }))}
                className={currentProject ? undefined : "text-accent-text font-medium"}
              >
                全部项目
              </Menu.Item>
              {projects.map(project => (
                <Menu.Item
                  key={project.id}
                  onSelect={() => setFilter(current => ({ ...current, projectId: project.id }))}
                  className={
                    project.id === filter.projectId ? "text-accent-text font-medium" : undefined
                  }
                >
                  <span className="flex w-full items-center gap-2">
                    <span className="min-w-0 flex-1 truncate">{project.title}</span>
                    <span className="text-ink-3 shrink-0 tabular-nums">{project.count}</span>
                  </span>
                </Menu.Item>
              ))}
            </Menu>
          )}
        </div>
        <div className="border-line-2 flex min-h-0 min-w-0 flex-1 overflow-hidden border-t">
          <div className="min-h-0 min-w-0 flex-1 overflow-hidden">
            {graphShown && items.length === 0 ? (
              <div className="text-ink-3 text-tau-meta flex h-full items-center justify-center">
                还没有可以放上地图的内容
              </div>
            ) : (
              graphShown && (
                <LinkGraph
                  className="h-full w-full"
                  items={graphItems}
                  focusId={focusIndex}
                  currentCardIds={currentIds}
                  filterCardIds={hits}
                  onClickItem={item => setPreview(previewOf(items, item.key))}
                  caption
                  captionHint={captionHint}
                  playbackRef={playbackRef}
                  // 邀请只在点开播放后才算看过：没点就一直留着，直到下次跨过更高的里程碑
                  onPlaybackChange={state => {
                    if (!state.active || invite === null) return;
                    markSeen(databaseName, invite);
                    setInvite(null);
                  }}
                  // 地图还没算出来时退回链接图谱，其布局坐标跨重启保持
                  persistKey="knowledge-map"
                  knowledgeMap={query.data?.map ?? null}
                  overlay={insights.overlay}
                  overlayRef={insights.overlayRef}
                />
              )
            )}
          </div>
          {insights.report}
        </div>
        <MapItemDrawer preview={preview} onClose={() => setPreview(null)} onOpen={openItem} />
      </div>
      {insights.floating}
    </div>
  );
}
