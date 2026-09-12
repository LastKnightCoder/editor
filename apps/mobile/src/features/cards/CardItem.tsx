// 卡片列表项（v2 模板）：整卡可点开详情页，不设 more 按钮——
// 修改类型/删除等操作收进详情页 ⋯ 菜单。
// 头部 = 彩点 + 彩色类型名 + 右侧时间；标签用品牌色 # chip。

import { memo, useCallback, useMemo, useRef } from "react";
import type { Descendant } from "slate";
import { Editor, type EditorRef } from "@tau/editor/src";
import { CardListItem } from "../../types";
import { useMobileTheme } from "../../hooks/useMobileTheme";
import { mobileCardPreviewExtensions } from "./editorExtensions";
import { cardCategoryDotClass, cardCategoryLabel, cardCategoryTextClass } from "./cardCategory";
import TagChips from "./TagChips";
import { useReadonlyContentSync } from "../../hooks/useReadonlyContentSync";

function formatTimeDisplay(ts: number): string {
  if (!ts) return "";
  const normalized = ts > 0 && ts < 1_000_000_000_000 ? ts * 1000 : ts;
  const date = new Date(normalized);
  const now = new Date();

  const isToday = date.toDateString() === now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday = date.toDateString() === yesterday.toDateString();

  const time = `${date.getHours().toString().padStart(2, "0")}:${date.getMinutes().toString().padStart(2, "0")}`;

  if (isToday) {
    return time;
  } else if (isYesterday) {
    return `昨天 ${time}`;
  } else if (date.getFullYear() === now.getFullYear()) {
    return `${date.getMonth() + 1}月${date.getDate()}日`;
  }

  return `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}`;
}

interface CardItemProps {
  item: CardListItem;
  onPreviewCard: (cardId: number) => void;
}

const CardItem = memo(({ item, onPreviewCard }: CardItemProps) => {
  const { theme } = useMobileTheme();
  const editorRef = useRef<EditorRef | null>(null);

  const editorContent = useMemo(() => {
    if (Array.isArray(item.content) && item.content.length > 0) {
      return item.content.slice(0, 3);
    }
    return [];
  }, [item.content]);

  const handleSyncedContent = useCallback((nextContent: Descendant[]) => {
    if (!Array.isArray(nextContent) || nextContent.length === 0) {
      return;
    }
    editorRef.current?.setEditorValue(nextContent.slice(0, 3));
  }, []);

  useReadonlyContentSync(item.contentId, {
    initialContent: editorContent,
    onContentSync: handleSyncedContent,
  });

  return (
    <article className="card pop-in rounded-card relative w-full overflow-hidden px-4 pb-3.5 pt-3 transition-transform duration-200 active:scale-[0.97]">
      <button type="button" onClick={() => onPreviewCard(item.id)} className="w-full text-left">
        <div className="mb-2.5 flex items-center gap-2">
          <span
            className={`h-[7px] w-[7px] shrink-0 rounded-full ${cardCategoryDotClass(item.category)}`}
            aria-hidden
          />
          <span className={`text-[11.5px] font-bold ${cardCategoryTextClass(item.category)}`}>
            {cardCategoryLabel(item.category)}
          </span>
          <span className="text-meta-ink ml-auto text-[11.5px] tabular-nums">
            {formatTimeDisplay(item.updateTime)}
          </span>
        </div>

        <div className="pointer-events-none min-w-0">
          {editorContent.length > 0 ? (
            <Editor
              ref={editorRef}
              className="overflow-hidden"
              readonly={true}
              initValue={editorContent}
              theme={theme}
              extensions={mobileCardPreviewExtensions}
            />
          ) : (
            <p className="text-ink line-clamp-1 text-[14px] font-bold">
              {item.excerpt?.split("\n")[0] || `卡片 #${item.id}`}
            </p>
          )}
        </div>

        <TagChips tags={item.tags} className="mt-2.5" />
      </button>
    </article>
  );
});

export default CardItem;
