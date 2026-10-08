import React, { memo, useState, useRef, useMemo } from "react";
import { Link2, Plus, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useMemoizedFn } from "ahooks";
import { toast } from "@tau/ui";
import { ColumnDef, CellValue } from "@tau/database";
import classNames from "classnames";
import ContentSelectorModal from "@/components/ContentSelectorModal";
import { useAddContentLink, useRemoveContentLink } from "@/features/context/queries";
import { entityRefKey, type EntityRef } from "@/entity/ref";
import { SearchResult } from "@/types";
import { CardLinksCellValue, CardLinksPluginConfig, LinkCellItem } from "../types";

interface CardLinksRendererProps {
  value: CellValue;
  column: ColumnDef<CardLinksPluginConfig>;
  theme: "light" | "dark";
  readonly: boolean;
  /** 组件库契约保留位：本插件 editable=false，连接写入直接走 useAddContentLink/useRemoveContentLink */
  onCellValueChange: (newValue: CellValue) => void;
}

const KIND_BY_TYPE: Partial<Record<SearchResult["type"], EntityRef["kind"]>> = {
  card: "card",
  article: "article",
  "project-item": "project-item",
  "diary-moment": "diary-moment",
};

const CardLinksRenderer: React.FC<CardLinksRendererProps> = memo(({ value, column, readonly }) => {
  const cell = value as CardLinksCellValue;
  const items: LinkCellItem[] = Array.isArray(cell?.items) ? cell.items : [];
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);
  const [selectorModalVisible, setSelectorModalVisible] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const addLink = useAddContentLink();
  const removeLink = useRemoveContentLink();

  const config = column.config as CardLinksPluginConfig | undefined;
  const onClickLink = config?.onClickLink;

  const excludeContentIds = useMemo(
    () => [
      ...(cell?.selfContentId ? [cell.selfContentId] : []),
      ...items.map(item => item.contentId).filter((id): id is number => id != null),
    ],
    [cell?.selfContentId, items]
  );

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
          {items.map(item => {
            const key = entityRefKey(item.ref);
            const isReadonly = item.inlineOnly;
            return (
              <motion.div
                key={key}
                className={classNames(
                  "border-line-1 bg-surface hover:bg-hover rounded-tau-sm group relative flex min-w-0 flex-none cursor-pointer items-center gap-2 overflow-visible border px-2 py-1 transition-colors",
                  {
                    "cursor-default opacity-60": isReadonly,
                  }
                )}
                onMouseEnter={() => setHoveredKey(key)}
                onMouseLeave={() => setHoveredKey(null)}
                onClick={() => {
                  if (!isReadonly) onClickLink?.(item.ref);
                }}
              >
                <div className="flex flex-none items-center">
                  <Link2 className="text-accent h-4 w-4" strokeWidth={1.75} />
                </div>

                <span className="text-ink-1 text-tau-sm max-w-24 truncate" title={item.title}>
                  {item.title}
                </span>

                <AnimatePresence>
                  {!readonly && !isReadonly && hoveredKey === key && (
                    <motion.button
                      type="button"
                      aria-label={`解除与「${item.title}」的连接`}
                      title="解除连接"
                      initial={{ scale: 0, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 0, opacity: 0 }}
                      whileHover={{ scale: 1.1 }}
                      whileTap={{ scale: 0.9 }}
                      className="bg-danger text-ink-inverse absolute -right-1 -top-1 z-10 flex h-3 w-3 cursor-pointer items-center justify-center rounded-full shadow-lg"
                      onClick={e => {
                        e.stopPropagation();
                        if (cell?.self) {
                          removeLink.mutate(
                            { from: cell.self, to: item.ref },
                            {
                              onError: error =>
                                toast.error(
                                  error instanceof Error ? error.message : "解除连接失败"
                                ),
                            }
                          );
                        }
                      }}
                    >
                      <X className="h-2 w-2" strokeWidth={2.5} />
                    </motion.button>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })}
        </div>
      </div>

      {/* 添加按钮 */}
      {!readonly && cell?.self && (
        <button
          type="button"
          className="bg-surface-hover text-ink-2 hover:text-ink-1 rounded-tau-sm absolute right-1 top-1/2 flex -translate-y-1/2 cursor-pointer items-center gap-1 px-1.5 py-1 transition-colors"
          aria-label="添加连接"
          onClick={() => setSelectorModalVisible(true)}
        >
          <Plus className="h-4 w-4" strokeWidth={1.75} />
        </button>
      )}

      <ContentSelectorModal
        open={selectorModalVisible}
        onCancel={() => setSelectorModalVisible(false)}
        onSelect={picked => {
          const item = Array.isArray(picked) ? picked[0] : picked;
          setSelectorModalVisible(false);
          const kind = item && KIND_BY_TYPE[item.type];
          if (!item || !kind || !cell?.self) return;
          addLink.mutate(
            { from: cell.self, to: { kind, id: item.id } },
            {
              onSuccess: linked => {
                if (!linked) toast.info("已连接或同一正文，无需重复连接");
              },
              onError: error =>
                toast.error(error instanceof Error ? error.message : "添加连接失败"),
            }
          );
        }}
        contentType={["card", "article", "project-item", "diary-moment"]}
        title="添加连接"
        excludeContentIds={excludeContentIds}
        multiple={false}
      />
    </div>
  );
});

CardLinksRenderer.displayName = "CardLinksRenderer";

export default CardLinksRenderer;
