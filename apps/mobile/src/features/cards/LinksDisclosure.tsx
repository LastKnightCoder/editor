// 关联区块：surface 卡内平铺关联列表（彩点 + 标题 + 类型），只读展示，无关联时不渲染。
// 管理入口在卡片详情 ⋯ ActionSheet（关联卡片 → CardLinksSheet，见 pages/contentDetail.page.tsx）。

import { useEffect, useRef, useState } from "react";
import { ChevronRight } from "lucide-react";

import * as tauri from "../../services/tauri";
import type { CardListItem } from "../../types";
import { getNavigator } from "../../router";

type LinksDisclosureProps = {
  /** 关联卡片 id 集合（正文显式连接 content_links 的卡片投影，存 cardId） */
  links: number[];
  onError?: (error: unknown, fallback: string) => void;
};

function resolveTitle(item: CardListItem): string {
  const firstLine = item.excerpt?.split("\n")[0]?.trim();
  return firstLine || `卡片 #${item.id}`;
}

export function LinksDisclosure({ links, onError }: LinksDisclosureProps) {
  const [items, setItems] = useState<CardListItem[]>([]);
  const [loading, setLoading] = useState(false);
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

  if (links.length === 0) {
    return null;
  }

  return (
    <div className="bg-surface shadow-card mt-4 rounded-[18px] px-4">
      <div className="border-line-1 flex items-center border-b py-3">
        <span className="text-ink-3 text-[11px] font-bold tracking-[0.14em]">
          关联 · {links.length}
        </span>
      </div>

      {loading ? (
        <div className="space-y-2.5 py-3.5">
          <div className="bg-page h-4 w-3/5 animate-pulse rounded" />
          <div className="bg-page h-4 w-4/5 animate-pulse rounded" />
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
            <span className="text-ink-1 min-w-0 flex-1 truncate text-[13.5px] font-medium">
              {resolveTitle(item)}
            </span>
            <ChevronRight size={14} className="text-ink-3 shrink-0" />
          </button>
        ))
      )}
    </div>
  );
}

export default LinksDisclosure;
