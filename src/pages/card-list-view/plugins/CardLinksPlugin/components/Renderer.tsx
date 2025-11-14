import React, { memo, useState, useRef, useMemo } from "react";
import { App } from "antd";
import { MdAdd, MdClose, MdLink } from "react-icons/md";
import { motion, AnimatePresence } from "framer-motion";
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
  ({ value, column, theme, readonly, onCellValueChange }) => {
    const links = Array.isArray(value) ? (value as number[]) : [];
    const isDark = theme === "dark";
    const { modal } = App.useApp();

    const [hoveredLinkId, setHoveredLinkId] = useState<number | null>(null);
    const [selectorModalVisible, setSelectorModalVisible] = useState(false);
    const scrollContainerRef = useRef<HTMLDivElement>(null);

    const config = column.config as CardLinksPluginConfig | undefined;
    const allCards = config?.allCards || [];
    const currentCardId = config?.currentCardId || 0;
    const onClickLink = config?.onClickLink;

    // 获取当前卡片
    const currentCard = useMemo(() => {
      return allCards.find((card) => card.id === currentCardId);
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
      const card = allCards.find((c) => c.id === cardId);
      return card ? `卡片 #${cardId}` : `卡片 #${cardId}`;
    });

    // 判断是否为只读链接（内联链接）
    const isReadonlyLink = useMemoizedFn((cardId: number) => {
      return inlineLinks.includes(cardId) && !links.includes(cardId);
    });

    const handleDeleteLink = useMemoizedFn(
      (linkId: number, e: React.MouseEvent) => {
        e.stopPropagation();

        if (isReadonlyLink(linkId)) {
          return; // 只读链接不能删除
        }

        modal.confirm({
          title: "确认删除",
          content: "确定要删除这个链接吗？",
          okText: "确定",
          cancelText: "取消",
          okButtonProps: {
            danger: true,
          },
          onOk() {
            const newValue = links.filter((id) => id !== linkId);
            onCellValueChange(newValue);
          },
        });
      },
    );

    const handleLinkClick = useMemoizedFn((linkId: number) => {
      if (onClickLink) {
        onClickLink(linkId);
      }
    });

    const handleSelectCard = useMemoizedFn(
      async (items: SearchResult | SearchResult[]) => {
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
      },
    );

    const handleWheel = useMemoizedFn((e: React.WheelEvent) => {
      if (scrollContainerRef.current) {
        scrollContainerRef.current.scrollLeft += e.deltaY;
      }
    });

    return (
      <div
        className="relative items-center h-full w-full"
        onWheel={handleWheel}
      >
        <div
          className="w-full h-full flex px-2 py-1 overflow-x-auto scrollbar-hide"
          ref={scrollContainerRef}
        >
          <div
            className="flex items-center gap-2 flex-1"
            style={{
              scrollbarWidth: "none",
              msOverflowStyle: "none",
            }}
          >
            {allLinks.map((linkId) => {
              const isReadonly = isReadonlyLink(linkId);
              return (
                <motion.div
                  key={linkId}
                  className={classNames(
                    "relative group overflow-visible cursor-pointer flex-none flex items-center gap-2 px-2 py-1 rounded border transition-all min-w-0",
                    {
                      "border-gray-300 bg-gray-100 hover:border-gray-400 hover:bg-gray-200":
                        !isDark && !isReadonly,
                      "border-gray-600 bg-gray-700 hover:border-gray-500 hover:bg-gray-600":
                        isDark && !isReadonly,
                      "border-gray-400 bg-gray-200 opacity-60 cursor-default":
                        !isDark && isReadonly,
                      "border-gray-500 bg-gray-600 opacity-60 cursor-default":
                        isDark && isReadonly,
                    },
                  )}
                  onMouseEnter={() => setHoveredLinkId(linkId)}
                  onMouseLeave={() => setHoveredLinkId(null)}
                  onClick={() => {
                    if (!isReadonly) {
                      handleLinkClick(linkId);
                    }
                  }}
                >
                  <div className="flex items-center flex-none">
                    <MdLink className="w-4 h-4 text-blue-500" />
                  </div>

                  <span
                    className="text-[12px] truncate max-w-24"
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
                        className={classNames(
                          "absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full flex items-center justify-center cursor-pointer shadow-lg z-10",
                          {
                            "bg-red-700": isDark,
                          },
                        )}
                        onClick={(e) => handleDeleteLink(linkId, e)}
                      >
                        <MdClose className="w-2 h-2 text-white" />
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
            className={classNames(
              "absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-1 px-1.5 py-1 rounded-md cursor-pointer transition-colors",
              {
                "bg-gray-200/80 text-gray-700 hover:bg-gray-300/80": !isDark,
                "bg-gray-700/80 text-gray-200 hover:bg-gray-600/80": isDark,
              },
            )}
            role="button"
            aria-label="添加链接"
            onClick={() => setSelectorModalVisible(true)}
          >
            <MdAdd className="w-4 h-4" />
          </div>
        )}

        {/* 卡片选择模态框 */}
        <ContentSelectorModal
          open={selectorModalVisible}
          onCancel={() => setSelectorModalVisible(false)}
          onSelect={handleSelectCard}
          contentType={["card"]}
          extensions={[]}
          title="选择要链接的卡片"
          emptyDescription="未找到相关卡片"
          multiple={false}
          excludeContentIds={[currentCardId]}
        />
      </div>
    );
  },
);

CardLinksRenderer.displayName = "CardLinksRenderer";

export default CardLinksRenderer;
