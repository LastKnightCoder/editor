import { memo, useState, useMemo, useCallback, useEffect, useRef } from "react";
import clsx from "clsx";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Eye, Layers } from "lucide-react";
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
        <div className="border-line-1 rounded-tau-md flex max-h-[520px] overflow-hidden border">
          {/* 左侧：标签树（窄） */}
          <div className="border-line-1 flex w-56 shrink-0 flex-col border-r">
            <div className="border-line-1 text-ink-1 flex shrink-0 items-center justify-between border-b px-4 py-3 text-[13px] font-medium">
              <span>标签树</span>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto py-2">
              {tree.length === 0 ? (
                <div className="text-ink-3 p-4 text-center text-[13px]">暂无标签</div>
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
            <div className="shrink-0 px-3 py-2">
              <SearchToolbar
                query={query}
                onQueryChange={setQuery}
                placeholder="搜索卡片标题或标签…"
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
            icon={<Layers size={16} strokeWidth={1.75} />}
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
  const isActive = activeTagId === node.id;

  const cards = useMemo(() => collectCardsFromTagNode(node), [node]);
  const selectedCount = useMemo(
    () => cards.filter(card => isItemSelected("card", card.id)).length,
    [cards, isItemSelected]
  );

  return (
    <div>
      <button
        type="button"
        onClick={() => onSelect(node.id)}
        className={clsx(
          "mx-1 flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-left text-[13px] transition-colors",
          isActive ? "bg-selected text-ink-1 font-medium" : "text-ink-2 hover:bg-hover"
        )}
        style={{ paddingLeft: depth * 12 + 12, width: "calc(100% - 8px)" }}
      >
        <span className="flex-1 truncate">{node.label}</span>
        {selectedCount > 0 && (
          <span className="bg-group text-ink-2 rounded-full px-1.5 py-0.5 text-[10px] tabular-nums">
            {selectedCount}/{node.count}
          </span>
        )}
        {selectedCount === 0 && (
          <span className="text-ink-3 text-[11px] tabular-nums">{node.count}</span>
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
                className={clsx(
                  "rounded-tau-sm flex min-h-[56px] items-center gap-3 px-4 py-3 transition-colors",
                  selected ? "bg-selected" : "hover:bg-hover"
                )}
              >
                <SelectionCheckbox
                  checked={selected}
                  onChange={() => onToggleCard(card.id)}
                  size="sm"
                />
                <div className="min-w-0 flex-1 cursor-pointer" onClick={() => onPreview(card)}>
                  <div
                    className={clsx(
                      "truncate text-[13px]",
                      selected ? "text-ink-1 font-medium" : "text-ink-1"
                    )}
                  >
                    {card.title}
                  </div>
                  <div className="text-tau-tiny text-ink-3 mt-0.5 truncate">{card.summary}</div>
                </div>
                <button
                  type="button"
                  onClick={() => onPreview(card)}
                  className="text-ink-3 hover:bg-hover hover:text-ink-1 shrink-0 rounded-md p-1.5 transition-colors"
                  title="预览"
                >
                  <Eye size={15} strokeWidth={1.75} />
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
