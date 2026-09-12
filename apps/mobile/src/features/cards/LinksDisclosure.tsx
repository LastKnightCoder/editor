// 关联区块：surface 卡内平铺关联列表（彩点 + 标题 + 类型），
// 底部「＋ 添加关联」行呼出 CardLinksSheet 多选弹层，确认后经 updateCardLinks 双向写回。
// 传 cardId 即可编辑；不传保持只读。

import { useEffect, useRef, useState } from "react";
import { ChevronRight, Plus } from "lucide-react";

import * as tauri from "../../services/tauri";
import type { CardListItem } from "../../types";
import { getNavigator } from "../../router";
import { cardCategoryDotClass, cardCategoryLabel } from "./cardCategory";
import CardLinksSheet from "./CardLinksSheet";

type LinksDisclosureProps = {
  /** 关联卡片 id 集合（cards.links，存 cardId） */
  links: number[];
  /** 传入则可编辑（显示添加入口） */
  cardId?: number;
  onLinksChanged?: (links: number[]) => void;
  onError?: (error: unknown, fallback: string) => void;
};

function resolveTitle(item: CardListItem): string {
  const firstLine = item.excerpt?.split("\n")[0]?.trim();
  return firstLine || `卡片 #${item.id}`;
}

export function LinksDisclosure({ links, cardId, onLinksChanged, onError }: LinksDisclosureProps) {
  const editable = typeof cardId === "number" && cardId > 0;
  const [items, setItems] = useState<CardListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  // 回调入 ref：父层传内联函数时，避免其引用变化触发关联列表重复拉取
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  useEffect(() => {
    if (links.length === 0) {
      setItems([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    tauri
      .getCardsByIds(links)
      .then(result => {
        if (!cancelled) setItems(result);
      })
      .catch(error => {
        if (!cancelled) onErrorRef.current?.(error, "关联内容加载失败");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [links]);

  const handleConfirm = async (next: number[]) => {
    setSheetOpen(false);
    const unchanged = next.length === links.length && next.every(id => links.includes(id));
    if (unchanged) {
      return;
    }
    try {
      const saved = await tauri.updateCardLinks({ id: cardId!, links: next });
      onLinksChanged?.(saved.links);
    } catch (error) {
      onError?.(error, "关联保存失败");
    }
  };

  if (links.length === 0 && !editable) {
    return null;
  }

  return (
    <div className="bg-surface shadow-card mt-4 rounded-[18px] px-4">
      <div className="border-line flex items-center border-b py-3">
        <span className="text-ink-3 text-[11px] font-bold tracking-[0.14em]">
          关联{links.length > 0 ? ` · ${links.length}` : ""}
        </span>
      </div>

      {loading ? (
        <div className="space-y-2.5 py-3.5">
          <div className="bg-input h-4 w-3/5 animate-pulse rounded" />
          <div className="bg-input h-4 w-4/5 animate-pulse rounded" />
        </div>
      ) : (
        items.map(item => (
          <button
            key={item.id}
            type="button"
            onClick={() => {
              getNavigator().push("contentDetail", { cardId: item.id });
            }}
            className="flex w-full items-center gap-3 py-3 text-left"
          >
            <span
              className={`h-[7px] w-[7px] shrink-0 rounded-full ${cardCategoryDotClass(item.category)}`}
              aria-hidden
            />
            <span className="text-ink min-w-0 flex-1 truncate text-[13.5px] font-medium">
              {resolveTitle(item)}
            </span>
            <span className="text-ink-3 shrink-0 text-[11px] font-medium">
              {cardCategoryLabel(item.category)}
            </span>
            <ChevronRight size={14} className="text-ink-3 shrink-0" />
          </button>
        ))
      )}

      {editable ? (
        <button
          type="button"
          onClick={() => setSheetOpen(true)}
          // 与列表行同构：左缘对齐列表标题（彩点 7px + gap 12px），无边框无底色
          className="flex w-full items-center py-3 pl-[19px] text-left transition-opacity active:opacity-55"
        >
          <Plus size={13} strokeWidth={2.5} className="text-ink-3 shrink-0" />
          <span className="text-ink-3 ml-1.5 text-[12.5px] font-medium">添加关联</span>
        </button>
      ) : null}

      {editable ? (
        <CardLinksSheet
          open={sheetOpen}
          selfCardId={cardId!}
          selected={links}
          onClose={() => setSheetOpen(false)}
          onConfirm={next => void handleConfirm(next)}
        />
      ) : null}
    </div>
  );
}

export default LinksDisclosure;
