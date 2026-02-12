import { memo, useMemo } from "react";
import { Editor } from "@tau/editor";
import { CardListItem } from "../../types";
import { mobileCardPreviewExtensions } from "./editorExtensions";

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
    return `今天 ${time}`;
  } else if (isYesterday) {
    return `昨天 ${time}`;
  } else if (date.getFullYear() === now.getFullYear()) {
    return `${date.getMonth() + 1}月${date.getDate()}日 ${time}`;
  }

  return `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()} ${time}`;
}

function IconMore() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <circle cx="12" cy="5" r="2" />
      <circle cx="12" cy="12" r="2" />
      <circle cx="12" cy="19" r="2" />
    </svg>
  );
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

  return (
    <button
      type="button"
      onClick={() => onPreviewCard(item.id)}
      className="card w-full p-4 text-left transition-colors active:bg-gray-50 dark:active:bg-gray-800 border border-gray-200 dark:border-gray-800 rounded-lg bg-white dark:bg-gray-900 shadow-sm"
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="min-w-0 flex-1">
          {/* Editor content area */}
          <div className="pointer-events-none">
            {editorContent.length > 0 ? (
              <Editor
                className="overflow-hidden"
                readonly={true}
                initValue={editorContent}
                extensions={mobileCardPreviewExtensions}
              />
            ) : (
              <p className="line-clamp-1 text-[15px] font-medium text-gray-900 dark:text-gray-100">
                {item.excerpt?.split("\n")[0] || `卡片 #${item.id}`}
              </p>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
          }}
          className="shrink-0 p-1 text-gray-300 dark:text-gray-600"
          aria-label="更多操作"
        >
          <IconMore />
        </button>
      </div>

      <div className="mt-3 flex items-center justify-between">
        <p className="text-xs text-gray-400 dark:text-gray-500">
          {formatTimeDisplay(item.updateTime)}
        </p>
        {item.tags.length > 0 && (
          <div className="flex gap-1">
            {item.tags.slice(0, 2).map((tag) => (
              <span
                key={tag}
                className="rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-600 dark:bg-blue-900/30 dark:text-blue-400"
              >
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>
    </button>
  );
});

export default CardItem;
