import { memo, useState, useMemo, useCallback, useEffect, useRef } from "react";
import classNames from "classnames";
import { useVirtualizer } from "@tanstack/react-virtual";
import useThemeColors from "@/hooks/useThemeColors";
import { CardTagNode, CardListItem, PublishContentType } from "../../types";
import { CARD_CATEGORY_LABEL } from "../../constants";
import { collectCardsFromTagNode } from "../../utils";
import { SelectionCheckbox } from "../SelectionCheckbox";
import { SearchToolbar } from "../SearchToolbar";
import { EmptyPlaceholder } from "../EmptyPlaceholder";
import { ContentPreviewModal } from "../ContentPreviewModal";
import { useSearch } from "../../hooks";

interface CardSelectorProps {
  tree: CardTagNode[];
  isItemSelected: (type: PublishContentType, id: number) => boolean;
  onToggleCard: (cardId: number) => void;
  onToggleTagCards: (node: CardTagNode, selected: boolean) => void;
}

export const CardSelector = memo<CardSelectorProps>(
  ({ tree, isItemSelected, onToggleCard, onToggleTagCards }) => {
    const themeColors = useThemeColors();
    const [activeTagId, setActiveTagId] = useState<string>("");
    const [previewCard, setPreviewCard] = useState<CardListItem | null>(null);
    const [onlySelected, setOnlySelected] = useState(false);

    // 获取当前选中标签节点
    const activeNode = useMemo(() => {
      if (!activeTagId) return tree[0] || null;
      const findNode = (nodes: CardTagNode[]): CardTagNode | null => {
        for (const node of nodes) {
          if (node.id === activeTagId) return node;
          const child = findNode(node.children);
          if (child) return child;
        }
        return null;
      };
      return findNode(tree);
    }, [tree, activeTagId]);

    // 获取当前标签下所有卡片
    const currentCards = useMemo(() => {
      if (!activeNode) return [];
      const cards = collectCardsFromTagNode(activeNode);
      const uniqueCards = new Map<number, CardListItem>();
      cards.forEach(card => {
        uniqueCards.set(card.id, card);
      });
      return Array.from(uniqueCards.values());
    }, [activeNode]);

    // 搜索过滤
    const { query, setQuery, filteredItems, isFiltering } = useSearch({
      items: currentCards,
      searchFields: ["title", "summary", "tags"] as (keyof CardListItem)[],
    });

    // 根据过滤条件显示卡片
    const displayCards = useMemo(() => {
      let cards = filteredItems;
      if (onlySelected) {
        cards = cards.filter(card => isItemSelected("card", card.id));
      }
      return cards;
    }, [filteredItems, onlySelected, isItemSelected]);

    // 检查是否全选
    const allSelected = useMemo(() => {
      return displayCards.length > 0 && displayCards.every(card => isItemSelected("card", card.id));
    }, [displayCards, isItemSelected]);

    // 全选/取消全选
    const handleSelectAll = useCallback(() => {
      if (!activeNode) return;
      onToggleTagCards(activeNode, !allSelected);
    }, [activeNode, allSelected, onToggleTagCards]);

    // 关闭预览弹窗
    const handleClosePreview = useCallback(() => {
      setPreviewCard(null);
    }, []);

    return (
      <>
        <div
          className={classNames(
            "flex max-h-[520px] overflow-hidden rounded-xl border",
            themeColors.cardBorderClass
          )}
        >
          {/* 左侧：标签树（窄） */}
          <div
            className={classNames(
              "flex w-56 flex-shrink-0 flex-col border-r",
              themeColors.cardBorderClass
            )}
          >
            <div
              className={classNames(
                "flex flex-shrink-0 items-center justify-between border-b px-4 py-3 text-sm font-medium",
                themeColors.cardBorderClass,
                themeColors.textClass
              )}
            >
              <span>标签树</span>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto py-2">
              {tree.length === 0 ? (
                <div
                  className={classNames("p-4 text-center text-sm", themeColors.secondaryTextClass)}
                >
                  暂无标签
                </div>
              ) : (
                tree.map(node => (
                  <TagTreeNode
                    key={node.id}
                    node={node}
                    activeTagId={activeTagId}
                    onSelect={setActiveTagId}
                    isItemSelected={isItemSelected}
                  />
                ))
              )}
            </div>
          </div>

          {/* 右侧：卡片列表（宽） */}
          <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
            <div className="flex-shrink-0 px-3 py-2">
              <SearchToolbar
                query={query}
                onQueryChange={setQuery}
                placeholder="搜索卡片标题或标签..."
                showSelectAll={displayCards.length > 0}
                allSelected={allSelected}
                onSelectAll={handleSelectAll}
                showOnlySelected
                onlySelected={onlySelected}
                onOnlySelectedChange={setOnlySelected}
                isFiltering={isFiltering}
              />
            </div>

            <div className="min-h-0 flex-1 overflow-hidden">
              {displayCards.length === 0 ? (
                <EmptyPlaceholder
                  text={onlySelected ? "暂无已选卡片" : query ? "无匹配结果" : "此标签下暂无卡片"}
                />
              ) : (
                <CardList
                  key={activeNode?.id || "__empty__"}
                  activeTagId={activeNode?.id || ""}
                  cards={displayCards}
                  isItemSelected={isItemSelected}
                  onToggleCard={onToggleCard}
                  onPreview={setPreviewCard}
                />
              )}
            </div>
          </div>
        </div>

        {/* 预览弹窗 */}
        {previewCard && (
          <ContentPreviewModal
            open={!!previewCard}
            title={previewCard.title}
            content={previewCard.raw.content}
            contentKey={previewCard.id}
            onClose={handleClosePreview}
            meta={{
              category: CARD_CATEGORY_LABEL[previewCard.category],
              updateTime: previewCard.updateTime,
            }}
            icon={
              <svg
                className="h-5 w-5 text-amber-500"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
            }
            iconBgColor="bg-amber-50 dark:bg-amber-500/20 border-amber-200 dark:border-amber-500/30"
          />
        )}
      </>
    );
  }
);

CardSelector.displayName = "CardSelector";

// 标签树节点组件
const TagTreeNode = memo<{
  node: CardTagNode;
  activeTagId: string;
  onSelect: (id: string) => void;
  isItemSelected: (type: PublishContentType, id: number) => boolean;
  depth?: number;
}>(({ node, activeTagId, onSelect, isItemSelected, depth = 0 }) => {
  const themeColors = useThemeColors();
  const isActive = activeTagId === node.id;

  const cards = useMemo(() => collectCardsFromTagNode(node), [node]);
  const selectedCount = useMemo(
    () => cards.filter(card => isItemSelected("card", card.id)).length,
    [cards, isItemSelected]
  );

  return (
    <div>
      <button
        onClick={() => onSelect(node.id)}
        className={classNames(
          "mx-1 flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-left text-sm transition-colors",
          isActive
            ? "bg-zinc-200/70 font-medium text-zinc-950 dark:bg-zinc-700/60 dark:text-zinc-50"
            : ["hover:bg-gray-50 dark:hover:bg-zinc-800/30", themeColors.textClass]
        )}
        style={{ paddingLeft: depth * 12 + 12, width: "calc(100% - 8px)" }}
      >
        <span className="flex-1 truncate">{node.label}</span>
        {selectedCount > 0 && (
          <span className="rounded-full bg-zinc-200 px-1.5 py-0.5 text-[10px] text-zinc-700 dark:bg-zinc-700 dark:text-zinc-100">
            {selectedCount}/{node.count}
          </span>
        )}
        {selectedCount === 0 && (
          <span className={classNames("text-xs", themeColors.secondaryTextClass)}>
            {node.count}
          </span>
        )}
      </button>
      {node.children.map(child => (
        <TagTreeNode
          key={child.id}
          node={child}
          activeTagId={activeTagId}
          onSelect={onSelect}
          isItemSelected={isItemSelected}
          depth={depth + 1}
        />
      ))}
    </div>
  );
});

TagTreeNode.displayName = "TagTreeNode";

// 卡片列表组件（使用虚拟滚动）
const CardList = memo<{
  activeTagId: string;
  cards: CardListItem[];
  isItemSelected: (type: PublishContentType, id: number) => boolean;
  onToggleCard: (cardId: number) => void;
  onPreview: (card: CardListItem) => void;
}>(({ activeTagId, cards, isItemSelected, onToggleCard, onPreview }) => {
  const themeColors = useThemeColors();
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: cards.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 68,
    overscan: 5,
  });

  useEffect(() => {
    parentRef.current?.scrollTo({ top: 0 });
    virtualizer.scrollToOffset(0);
  }, [activeTagId, virtualizer]);

  return (
    <div ref={parentRef} className="h-full overflow-y-auto">
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          width: "100%",
          position: "relative",
        }}
      >
        {virtualizer.getVirtualItems().map(virtualItem => {
          const card = cards[virtualItem.index];
          const selected = isItemSelected("card", card.id);

          return (
            <div
              key={card.id}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                height: `${virtualItem.size}px`,
                transform: `translateY(${virtualItem.start}px)`,
              }}
              className="px-3 py-1"
            >
              <div
                className={classNames(
                  "flex min-h-[56px] items-center gap-3 rounded-lg px-4 py-3 transition-colors",
                  selected
                    ? "bg-zinc-200/60 dark:bg-zinc-700/50"
                    : "hover:bg-gray-50 dark:hover:bg-zinc-800/30"
                )}
              >
                <SelectionCheckbox
                  checked={selected}
                  onChange={() => onToggleCard(card.id)}
                  size="sm"
                />
                <div className="min-w-0 flex-1 cursor-pointer" onClick={() => onPreview(card)}>
                  <div
                    className={classNames(
                      "truncate text-sm",
                      selected
                        ? "font-medium text-zinc-950 dark:text-zinc-50"
                        : themeColors.textClass
                    )}
                  >
                    {card.title}
                  </div>
                  <div
                    className={classNames(
                      "mt-0.5 truncate text-xs",
                      themeColors.secondaryTextClass
                    )}
                  >
                    {card.summary}
                  </div>
                </div>
                <button
                  onClick={() => onPreview(card)}
                  className={classNames(
                    "flex-shrink-0 rounded-lg p-1.5 transition-colors",
                    "hover:bg-gray-200 dark:hover:bg-zinc-700",
                    themeColors.secondaryTextClass
                  )}
                  title="预览"
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                    />
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                    />
                  </svg>
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
});

CardList.displayName = "CardList";
