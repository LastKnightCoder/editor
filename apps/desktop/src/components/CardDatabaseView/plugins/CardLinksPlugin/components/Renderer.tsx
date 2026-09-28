import React, { memo, useState, useRef, useMemo } from "react";
import { Link2, Plus, X } from "lucide-react";
import { ConfirmDialog } from "@tau/ui";
import { motion, AnimatePresence } from "motion/react";
import { useMemoizedFn } from "ahooks";
import { ColumnDef, CellValue } from "@/components/Database/types";
import { CardLinksPluginConfig } from "../types";
import { getInlineLinks } from "@/utils";
import classNames from "classnames";
import ContentSelectorModal from "@/components/ContentSelectorModal";
import { SearchResult } from "@/types";

interface CardLinksRendererProps {
  value: CellValue;
  column: ColumnDef<CardLinksPluginConfig>;
  theme: "light" | "dark";
  readonly: boolean;
  onCellValueChange: (newValue: number[]) => void;
}

const CardLinksRenderer: React.FC<CardLinksRendererProps> = memo(
  ({ value, column, readonly, onCellValueChange }) => {
    const links = Array.isArray(value) ? (value as number[]) : [];
    const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

    const [hoveredLinkId, setHoveredLinkId] = useState<number | null>(null);
    const [selectorModalVisible, setSelectorModalVisible] = useState(false);
    const scrollContainerRef = useRef<HTMLDivElement>(null);

    const config = column.config as CardLinksPluginConfig | undefined;
    const allCards = config?.allCards || [];
    const currentCardId = config?.currentCardId || 0;
    const onClickLink = config?.onClickLink;

    // 获取当前卡片
    const currentCard = useMemo(() => {
      return allCards.find(card => card.id === currentCardId);
    }, [allCards, currentCardId]);

    // 获取内联链接（从卡片内容中提取的）
    const inlineLinks = useMemo(() => {
      if (!currentCard) return [];
      return getInlineLinks(currentCard);
    }, [currentCard]);

    // 所有链接 = 手动添加的 links + 内联链接
    const allLinks = useMemo(() => {
      return [...new Set([...links, ...inlineLinks])];
    }, [links, inlineLinks]);

    // 获取链接卡片的标题
    const getLinkCardTitle = useMemoizedFn((cardId: number) => {
      const card = allCards.find(c => c.id === cardId);
      return card ? `卡片 #${cardId}` : `卡片 #${cardId}`;
    });

    // 判断是否为只读链接（内联链接）
    const isReadonlyLink = useMemoizedFn((cardId: number) => {
      return inlineLinks.includes(cardId) && !links.includes(cardId);
    });

    const handleDeleteLink = useMemoizedFn((linkId: number, e: React.MouseEvent) => {
      e.stopPropagation();

      if (isReadonlyLink(linkId)) {
        return; // 只读链接不能删除
      }

      setConfirmDeleteId(linkId);
    });

    const handleLinkClick = useMemoizedFn((linkId: number) => {
      if (onClickLink) {
        onClickLink(linkId);
      }
    });

    const handleSelectCard = useMemoizedFn(async (items: SearchResult | SearchResult[]) => {
      const item = Array.isArray(items) ? items[0] : items;
      if (!item || item.type !== "card") return;

      const cardId = item.id;

      // 检查是否已经链接
      if (allLinks.includes(cardId)) {
        return;
      }

      // 添加新链接
      const newValue = [...links, cardId];
      onCellValueChange(newValue);
    });

    const handleWheel = useMemoizedFn((e: React.WheelEvent) => {
      if (scrollContainerRef.current) {
        scrollContainerRef.current.scrollLeft += e.deltaY;
      }
    });

    return (
      <div className="relative h-full w-full items-center" onWheel={handleWheel}>
        <div
          className="scrollbar-hide flex h-full w-full overflow-x-auto px-2 py-1"
          ref={scrollContainerRef}
        >
          <div
            className="flex flex-1 items-center gap-2"
            style={{
              scrollbarWidth: "none",
              msOverflowStyle: "none",
            }}
          >
            {allLinks.map(linkId => {
              const isReadonly = isReadonlyLink(linkId);
              return (
                <motion.div
                  key={linkId}
                  className={classNames(
                    "border-line-1 bg-surface hover:bg-hover rounded-tau-sm group relative flex min-w-0 flex-none cursor-pointer items-center gap-2 overflow-visible border px-2 py-1 transition-colors",
                    {
                      "cursor-default opacity-60": isReadonly,
                    }
                  )}
                  onMouseEnter={() => setHoveredLinkId(linkId)}
                  onMouseLeave={() => setHoveredLinkId(null)}
                  onClick={() => {
                    if (!isReadonly) {
                      handleLinkClick(linkId);
                    }
                  }}
                >
                  <div className="flex flex-none items-center">
                    <Link2 className="text-accent h-4 w-4" strokeWidth={1.75} />
                  </div>

                  <span
                    className="text-ink-1 text-tau-sm max-w-24 truncate"
                    title={getLinkCardTitle(linkId)}
                  >
                    {getLinkCardTitle(linkId)}
                  </span>

                  <AnimatePresence>
                    {!readonly && !isReadonly && hoveredLinkId === linkId && (
                      <motion.div
                        initial={{ scale: 0, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0, opacity: 0 }}
                        whileHover={{ scale: 1.1 }}
                        whileTap={{ scale: 0.9 }}
                        className="bg-danger text-ink-inverse absolute -right-1 -top-1 z-10 flex h-3 w-3 cursor-pointer items-center justify-center rounded-full shadow-lg"
                        onClick={e => handleDeleteLink(linkId, e)}
                      >
                        <X className="h-2 w-2" strokeWidth={2.5} />
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              );
            })}
          </div>
        </div>

        {/* 添加按钮 */}
        {!readonly && (
          <div
            className="bg-hover hover:bg-press text-ink-2 hover:text-ink-1 rounded-tau-sm absolute right-1 top-1/2 flex -translate-y-1/2 cursor-pointer items-center gap-1 px-1.5 py-1 transition-colors"
            role="button"
            aria-label="添加连接"
            onClick={() => setSelectorModalVisible(true)}
          >
            <Plus className="h-4 w-4" strokeWidth={1.75} />
          </div>
        )}

        {/* 卡片选择模态框 */}
        <ConfirmDialog
          open={confirmDeleteId !== null}
          onOpenChange={open => {
            if (!open) setConfirmDeleteId(null);
          }}
          title="确认删除"
          impact="确定要删除这个链接吗？"
          danger
          confirmText="确定"
          onConfirm={() => {
            const linkId = confirmDeleteId;
            if (linkId === null) return;
            onCellValueChange(links.filter(id => id !== linkId));
          }}
        />

        <ContentSelectorModal
          open={selectorModalVisible}
          onCancel={() => setSelectorModalVisible(false)}
          onSelect={handleSelectCard}
          contentType={["card"]}
          title="选择要链接的卡片"
          emptyDescription="未找到相关卡片"
          multiple={false}
          excludeContentIds={[currentCardId]}
        />
      </div>
    );
  }
);

CardLinksRenderer.displayName = "CardLinksRenderer";

export default CardLinksRenderer;
