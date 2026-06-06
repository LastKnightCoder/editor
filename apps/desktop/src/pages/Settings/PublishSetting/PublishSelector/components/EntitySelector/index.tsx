import { memo, useState, useMemo, useCallback } from "react";
import classNames from "classnames";
import useThemeColors from "@/hooks/useThemeColors";
import { Project } from "@/types/project";
import { IDocument } from "@/types/document";
import { PublishContentType } from "@/types/publish";
import { EntityScope, DocTreeNode } from "../../types";
import { collectDocNodeIds } from "../../utils";
import { SelectionCheckbox } from "../SelectionCheckbox";
import { SearchToolbar } from "../SearchToolbar";
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
    const [modalEntity, setModalEntity] = useState<Project | IDocument | null>(
      null,
    );
    const [modalLoading, setModalLoading] = useState(false);
    const [onlySelected, setOnlySelected] = useState(false);

    const typeLabel = type === "project" ? "项目" : "知识库";

    // 转换为统一格式
    const entityItems = useMemo<EntityItem[]>(
      () =>
        entities.map((entity) => ({
          id: entity.id,
          title: entity.title || `${typeLabel} #${entity.id}`,
          type,
          raw: entity,
        })),
      [entities, type, typeLabel],
    );

    // 搜索过滤
    const { query, setQuery, filteredItems, isFiltering } = useSearch({
      items: entityItems,
      searchFields: ["title"] as (keyof EntityItem)[],
    });

    // 根据过滤条件显示
    const displayEntities = useMemo(() => {
      let items = filteredItems;
      if (onlySelected) {
        items = items.filter((item) => isItemSelected(type, item.id));
      }
      return items;
    }, [filteredItems, onlySelected, isItemSelected, type]);

    // 检查是否全选
    const allSelected = useMemo(() => {
      return (
        displayEntities.length > 0 &&
        displayEntities.every((item) => isItemSelected(type, item.id))
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
      [treeCache, onLoadTree],
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
      [modalEntity, treeCache, onToggleEntity, onUpdateScope],
    );

    return (
      <div className="min-h-[480px]">
        <SearchToolbar
          query={query}
          onQueryChange={setQuery}
          placeholder={`搜索${typeLabel}名称...`}
          showSelectAll={displayEntities.length > 0}
          allSelected={allSelected}
          onSelectAll={handleSelectAll}
          showOnlySelected
          onlySelected={onlySelected}
          onOnlySelectedChange={setOnlySelected}
          isFiltering={isFiltering}
        />

        {displayEntities.length === 0 ? (
          <EmptyPlaceholder
            text={
              onlySelected
                ? `暂无已选${typeLabel}`
                : query
                  ? "无匹配结果"
                  : `暂无${typeLabel}`
            }
          />
        ) : (
          <div className="space-y-3">
            {displayEntities.map((item) => (
              <EntityCard
                key={item.id}
                entity={item}
                selected={isItemSelected(type, item.id)}
                scope={scopes.get(item.id)}
                treeLoaded={treeCache.has(item.id)}
                totalCount={
                  treeCache.has(item.id)
                    ? collectDocNodeIds(treeCache.get(item.id)!).length
                    : undefined
                }
                onToggle={() =>
                  onToggleEntity(item.id, !isItemSelected(type, item.id))
                }
                onManage={() => handleOpenModal(item.raw)}
              />
            ))}
          </div>
        )}

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
  },
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
}>(
  ({ entity, selected, scope, treeLoaded, totalCount, onToggle, onManage }) => {
    const themeColors = useThemeColors();
    const typeLabel = entity.type === "project" ? "项目" : "知识库";

    const scopeDescription = useMemo(() => {
      if (!selected) return `未选择该${typeLabel}`;
      if (!scope || scope.mode === "all") return "将发布全部文档";
      return `将发布 ${scope.nodeIds.size} 篇文档`;
    }, [selected, scope, typeLabel]);

    return (
      <div
        className={classNames(
          "flex flex-col gap-3 rounded-xl border p-4 transition-colors md:flex-row md:items-center",
          selected
            ? ["border-transparent bg-zinc-200/60 dark:bg-zinc-700/50"]
            : [themeColors.cardBgClass, themeColors.cardBorderClass],
        )}
      >
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <SelectionCheckbox checked={selected} onChange={onToggle} />
          <div className="min-w-0">
            <div
              className={classNames(
                "text-sm font-medium truncate",
                selected
                  ? "text-zinc-950 dark:text-zinc-50"
                  : themeColors.textClass,
              )}
            >
              {entity.title}
            </div>
            <div
              className={classNames(
                "text-xs mt-0.5",
                themeColors.secondaryTextClass,
              )}
            >
              {scopeDescription}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={onManage}
            className={classNames(
              "px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors",
              themeColors.activeBorderClass,
              themeColors.activeTextClass,
              themeColors.hoverClass,
            )}
          >
            {treeLoaded ? "管理文档" : "加载文档"}
          </button>

          {totalCount !== undefined && (
            <span
              className={classNames(
                "px-2 py-1 rounded-lg text-xs",
                themeColors.tagBgClass,
                themeColors.tagTextClass,
              )}
            >
              共 {totalCount} 篇
            </span>
          )}

          {scope?.mode === "partial" && (
            <span
              className={classNames(
                "px-2 py-1 rounded-lg text-xs",
                themeColors.badgeBgClass,
                themeColors.badgeTextClass,
              )}
            >
              部分发布
            </span>
          )}
        </div>
      </div>
    );
  },
);

EntityCard.displayName = "EntityCard";
