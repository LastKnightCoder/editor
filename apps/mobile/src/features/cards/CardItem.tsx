// 卡片列表项（v2 模板）：整卡可点开详情页，不设 more 按钮——
// 删除等操作收进详情页 ⋯ 菜单。
// 头部 = 右侧时间；标签用品牌色 # chip。

import { memo, useCallback, useMemo, useState } from "react";
import { getMobileContentKit } from "../../services/editorKit";
import type { Descendant } from "slate";
import { Editor, createValueDocument } from "@tau/editor";
import { isEditorContentEmpty } from "./editorContentUtils";
import { CardListItem } from "../../types";
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
  const editorContent = useMemo(() => {
    if (Array.isArray(item.content) && item.content.length > 0) {
      return item.content.slice(0, 3);
    }
    return [];
  }, [item.content]);
  const [document, setDocument] = useState(() => createValueDocument(editorContent));

  const handleSyncedContent = useCallback((nextContent: Descendant[]) => {
    setDocument(createValueDocument(nextContent.slice(0, 3)));
  }, []);

  useReadonlyContentSync(item.contentId, {
    initialContent: editorContent,
    onContentSync: handleSyncedContent,
  });

  return (
    <article className="card pop-in rounded-card relative w-full overflow-hidden px-4 pb-3.5 pt-3 transition-transform duration-200 active:scale-[0.97]">
      <button type="button" onClick={() => onPreviewCard(item.id)} className="w-full text-left">
        <div className="mb-2.5 flex items-center gap-2">
          <span className="text-ink-2 ml-auto text-[11.5px] tabular-nums">
            {formatTimeDisplay(item.updateTime)}
          </span>
        </div>

        <div className="pointer-events-none min-w-0">
          {!isEditorContentEmpty(document.initialValue) ? (
            <Editor
              kit={getMobileContentKit()}
              className="overflow-hidden"
              readonly={true}
              document={document}
            />
          ) : (
            <p className="text-ink-1 line-clamp-1 text-[14px] font-bold">
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
