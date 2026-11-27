import { selectionSearchText, usePublishSelectionI18n } from "../../i18n";
import { memo, useState, useMemo, useCallback, useEffect, useRef } from "react";
import clsx from "clsx";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Eye, Layers } from "lucide-react";
import { CardTagNode, CardListItem, PublishContentType, SelectionFilter } from "../../types";
import { collectCardsFromTagNode, matchesSelectionFilter } from "../../utils";
import { SelectionCheckbox } from "../SelectionCheckbox";
import { SearchToolbar } from "../SearchToolbar";
import { FadeScroll } from "@tau/ui";
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
    const { t } = usePublishSelectionI18n();
    const [activeTagId, setActiveTagId] = useState<string>("");
    const [previewCard, setPreviewCard] = useState<CardListItem | null>(null);
    const [selectionFilter, setSelectionFilter] = useState<SelectionFilter>("all");

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

    const currentCards = useMemo(() => {
      if (!activeNode) return [];
      const cards = collectCardsFromTagNode(activeNode);
      const uniqueCards = new Map<number, CardListItem>();
      cards.forEach(card => {
        uniqueCards.set(card.id, card);
      });
      return Array.from(uniqueCards.values());
    }, [activeNode]);

    const searchItems = useMemo(
      () =>
        currentCards.map(card => ({
          ...card,
          searchText: selectionSearchText({
            type: "card",
            id: card.id,
            title: card.title,
            description: card.summary,
          }),
        })),
      [currentCards]
    );

    // 搜索过滤
    const { query, setQuery, filteredItems, isFiltering } = useSearch({
      items: searchItems,
      searchFields: ["title", "summary", "tags", "searchText"],
    });

    // 根据过滤条件显示卡片
    const displayCards = useMemo(() => {
      if (selectionFilter === "all") return filteredItems;
      return filteredItems.filter(card =>
        matchesSelectionFilter(selectionFilter, isItemSelected("card", card.id))
      );
    }, [filteredItems, selectionFilter, isItemSelected]);

    const allSelected = useMemo(() => {
      return displayCards.length > 0 && displayCards.every(card => isItemSelected("card", card.id));
    }, [displayCards, isItemSelected]);

    // 全选/取消全选
    const handleSelectAll = useCallback(() => {
      if (!activeNode) return;
      onToggleTagCards(activeNode, !allSelected);
    }, [activeNode, allSelected, onToggleTagCards]);

    const handleClosePreview = useCallback(() => {
      setPreviewCard(null);
    }, []);

    return (
      <>
        <div className="flex h-full min-h-0">
          {/* 左侧：标签树（窄） */}
          <div className="flex w-48 shrink-0 flex-col pt-3.5 pl-1">
            <div className="text-ink-3 shrink-0 px-3 pb-1.5 text-[11.5px] font-medium">
              {t("tags")}
            </div>
            <FadeScroll className="mb-3 min-h-0 flex-1 pb-1">
              {tree.length === 0 ? (
                <div className="text-ink-3 p-4 text-center text-[13px]">{t("tags.empty")}</div>
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
            </FadeScroll>
          </div>

          {/* 右侧：卡片列表（宽） */}
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            <SearchToolbar
              query={query}
              onQueryChange={setQuery}
              placeholder={t("search.card")}
              showSelectAll={displayCards.length > 0}
              allSelected={allSelected}
              onSelectAll={handleSelectAll}
              selectionFilter={selectionFilter}
              onSelectionFilterChange={setSelectionFilter}
              isFiltering={isFiltering}
            />

            <div className="mb-3 min-h-0 flex-1 overflow-hidden">
              {displayCards.length === 0 ? (
                <EmptyPlaceholder
                  text={
                    query
                      ? t("empty.matches")
                      : selectionFilter !== "all"
                        ? t(`empty.card.${selectionFilter}`)
                        : t("empty.tagCards")
                  }
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
            title={previewCard.raw.tags[0] || t("card.untitled", { id: previewCard.id })}
            content={previewCard.raw.content}
            contentKey={previewCard.id}
            onClose={handleClosePreview}
            meta={{
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
  const { t } = usePublishSelectionI18n();
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
          "flex w-full items-center gap-2 rounded-[8px] py-1.5 pr-2 text-left text-[13px] transition-colors",
          isActive ? "bg-selected text-accent-text font-medium" : "text-ink-2 hover:bg-hover"
        )}
        style={{ paddingLeft: depth * 12 + 10 }}
      >
        <span className="flex-1 truncate">
          {node.builtin === "untagged" ? t("tags.untagged") : node.label}
        </span>
        <span className="text-ink-3 shrink-0 font-mono text-[11px] tabular-nums">
          {selectedCount > 0 ? (
            <>
              <span className="text-ink-2">{selectedCount}</span>/{node.count}
            </>
          ) : (
            node.count
          )}
        </span>
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
  const { t } = usePublishSelectionI18n();
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: cards.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 52,
    overscan: 5,
  });

  useEffect(() => {
    parentRef.current?.scrollTo({ top: 0 });
    virtualizer.scrollToOffset(0);
  }, [activeTagId, virtualizer]);

  return (
    <FadeScroll scrollRef={parentRef} className="h-full px-2.5 pb-1">
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
            >
              <div className="hover:bg-hover flex h-full items-center gap-2.5 rounded-[8px] px-2 py-1.5 transition-colors">
                <SelectionCheckbox
                  checked={selected}
                  onChange={() => onToggleCard(card.id)}
                  size="sm"
                />
                <div className="min-w-0 flex-1 cursor-pointer" onClick={() => onPreview(card)}>
                  <div className="text-ink-1 truncate text-[13px]">
                    {card.raw.tags[0] || t("card.untitled", { id: card.id })}
                  </div>
                  <div className="text-tau-tiny text-ink-3 mt-0.5 truncate">
                    {card.summary || t("content.empty")}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onPreview(card)}
                  className="text-ink-3 hover:bg-press hover:text-ink-1 shrink-0 rounded-[6px] p-1.5 transition-colors"
                  title={t("preview")}
                >
                  <Eye size={15} strokeWidth={1.75} />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </FadeScroll>
  );
});

CardList.displayName = "CardList";
