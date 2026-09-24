import { memo, useState, useMemo, useCallback } from "react";
import { Project } from "@/types/project";
import { IDocument } from "@/types/document";
import { PublishContentType } from "@/types/publish";
import { EntityScope, DocTreeNode, SelectionFilter } from "../../types";
import { collectDocNodeIds, matchesSelectionFilter, selectionFilterLabel } from "../../utils";
import { SelectionCheckbox } from "../SelectionCheckbox";
import { SearchToolbar } from "../SearchToolbar";
import { FadeScroll } from "../FadeScroll";
import { EmptyPlaceholder } from "../EmptyPlaceholder";
import { EntityTreeModal } from "./EntityTreeModal";
import { useSearch } from "../../hooks";

interface EntityItem {
  id: number;
  title: string;
  type: "project" | "document";
  raw: Project | IDocument;
}

interface EntitySelectorProps {
  type: "project" | "document";
  entities: (Project | IDocument)[];
  isItemSelected: (type: PublishContentType, id: number) => boolean;
  scopes: Map<number, EntityScope>;
  treeCache: Map<number, DocTreeNode[]>;
  onToggleEntity: (id: number, enabled: boolean) => Promise<void>;
  onUpdateScope: (entityId: number, scope: EntityScope) => Promise<void>;
  onLoadTree: (entity: Project | IDocument) => Promise<DocTreeNode[]>;
}

export const EntitySelector = memo<EntitySelectorProps>(
  ({
    type,
    entities,
    isItemSelected,
    scopes,
    treeCache,
    onToggleEntity,
    onUpdateScope,
    onLoadTree,
  }) => {
    const [modalEntity, setModalEntity] = useState<Project | IDocument | null>(null);
    const [modalLoading, setModalLoading] = useState(false);
    const [selectionFilter, setSelectionFilter] = useState<SelectionFilter>("all");

    const typeLabel = type === "project" ? "项目" : "知识库";

    // 转换为统一格式
    const entityItems = useMemo<EntityItem[]>(
      () =>
        entities.map(entity => ({
          id: entity.id,
          title: entity.title || `${typeLabel} #${entity.id}`,
          type,
          raw: entity,
        })),
      [entities, type, typeLabel]
    );

    // 搜索过滤
    const { query, setQuery, filteredItems, isFiltering } = useSearch({
      items: entityItems,
      searchFields: ["title"] as (keyof EntityItem)[],
    });

    // 根据过滤条件显示
    const displayEntities = useMemo(() => {
      if (selectionFilter === "all") return filteredItems;
      return filteredItems.filter(item =>
        matchesSelectionFilter(selectionFilter, isItemSelected(type, item.id))
      );
    }, [filteredItems, selectionFilter, isItemSelected, type]);

    // 检查是否全选
    const allSelected = useMemo(() => {
      return (
        displayEntities.length > 0 && displayEntities.every(item => isItemSelected(type, item.id))
      );
    }, [displayEntities, isItemSelected, type]);

    // 全选/取消全选
    const handleSelectAll = useCallback(async () => {
      for (const item of displayEntities) {
        await onToggleEntity(item.id, !allSelected);
      }
    }, [displayEntities, allSelected, onToggleEntity]);

    // 打开文档树弹窗
    const handleOpenModal = useCallback(
      async (entity: Project | IDocument) => {
        setModalEntity(entity);
        setModalLoading(true);

        // 如果缓存中没有，加载文档树
        if (!treeCache.has(entity.id)) {
          await onLoadTree(entity);
        }

        setModalLoading(false);
      },
      [treeCache, onLoadTree]
    );

    // 关闭弹窗
    const handleCloseModal = useCallback(() => {
      setModalEntity(null);
    }, []);

    // 保存弹窗选择
    const handleSaveModal = useCallback(
      async (selectedIds: Set<number>) => {
        if (!modalEntity) return;

        const trees = treeCache.get(modalEntity.id);
        if (!trees) return;

        const totalIds = collectDocNodeIds(trees);

        if (selectedIds.size === 0) {
          // 没有选择任何文档，取消选择该实体
          await onToggleEntity(modalEntity.id, false);
        } else {
          // 判断是全选还是部分选择
          const isAllSelected = selectedIds.size === totalIds.length;
          const scope: EntityScope = isAllSelected
            ? { mode: "all" }
            : { mode: "partial", nodeIds: selectedIds };

          await onUpdateScope(modalEntity.id, scope);
        }

        setModalEntity(null);
      },
      [modalEntity, treeCache, onToggleEntity, onUpdateScope]
    );

    return (
      <div className="flex h-full min-h-0 flex-col">
        <SearchToolbar
          query={query}
          onQueryChange={setQuery}
          placeholder={`搜索${typeLabel}名称...`}
          showSelectAll={displayEntities.length > 0}
          allSelected={allSelected}
          onSelectAll={handleSelectAll}
          selectionFilter={selectionFilter}
          onSelectionFilterChange={setSelectionFilter}
          isFiltering={isFiltering}
        />

        <FadeScroll className="mb-3 min-h-0 flex-1 px-2.5 pb-1">
          {displayEntities.length === 0 ? (
            <EmptyPlaceholder
              text={
                query
                  ? "无匹配结果"
                  : selectionFilter !== "all"
                    ? `暂无${selectionFilterLabel(selectionFilter)}${typeLabel}`
                    : `暂无${typeLabel}`
              }
            />
          ) : (
            <div className="flex flex-col gap-0.5">
              {displayEntities.map(item => {
                const tree = treeCache.get(item.id);
                return (
                  <EntityCard
                    key={item.id}
                    entity={item}
                    selected={isItemSelected(type, item.id)}
                    scope={scopes.get(item.id)}
                    treeLoaded={tree !== undefined}
                    totalCount={tree ? collectDocNodeIds(tree).length : undefined}
                    onToggle={() => onToggleEntity(item.id, !isItemSelected(type, item.id))}
                    onManage={() => handleOpenModal(item.raw)}
                  />
                );
              })}
            </div>
          )}
        </FadeScroll>

        {/* 文档树弹窗 */}
        {modalEntity && (
          <EntityTreeModal
            open={!!modalEntity}
            loading={modalLoading}
            type={type}
            entity={modalEntity}
            nodes={treeCache.get(modalEntity.id) || []}
            currentScope={scopes.get(modalEntity.id)}
            onCancel={handleCloseModal}
            onConfirm={handleSaveModal}
          />
        )}
      </div>
    );
  }
);

EntitySelector.displayName = "EntitySelector";

// 实体卡片组件
const EntityCard = memo<{
  entity: EntityItem;
  selected: boolean;
  scope?: EntityScope;
  treeLoaded: boolean;
  totalCount?: number;
  onToggle: () => void;
  onManage: () => void;
}>(({ entity, selected, scope, treeLoaded, totalCount, onToggle, onManage }) => {
  const typeLabel = entity.type === "project" ? "项目" : "知识库";

  const scopeDescription = useMemo(() => {
    if (!selected) return `未选择该${typeLabel}`;
    if (!scope || scope.mode === "all") return "将发布全部文档";
    return `将发布 ${scope.nodeIds.size} 篇文档`;
  }, [selected, scope, typeLabel]);

  return (
    <div className="hover:bg-hover group flex items-center gap-2.5 rounded-[8px] px-2 py-1.5 transition-colors">
      <SelectionCheckbox checked={selected} onChange={onToggle} size="sm" />
      <div className="min-w-0 flex-1 cursor-pointer" onClick={onToggle}>
        <div className="text-ink-1 truncate text-[13px]">{entity.title}</div>
        <div className="text-tau-tiny text-ink-3 mt-0.5 truncate">{scopeDescription}</div>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {scope?.mode === "partial" && (
          <span className="bg-accent-soft text-accent-text rounded-full px-[7px] text-[10.5px]">
            部分发布
          </span>
        )}

        {totalCount !== undefined && (
          <span className="text-ink-3 font-mono text-[11px] tabular-nums">共 {totalCount} 篇</span>
        )}

        <button
          type="button"
          onClick={onManage}
          className="text-ink-2 hover:bg-press hover:text-ink-1 h-7 rounded-[8px] px-[11px] text-[12.5px] transition-colors"
        >
          {treeLoaded ? "管理文档" : "加载文档"}
        </button>
      </div>
    </div>
  );
});

EntityCard.displayName = "EntityCard";
