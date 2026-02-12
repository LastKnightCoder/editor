import { memo, useMemo } from "react";
import { Editor } from "@tau/editor";
import { CardListItem } from "../../types";
import { useMobileTheme } from "../../hooks/useMobileTheme";
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
  const { theme } = useMobileTheme();
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
      className="card w-full rounded-lg border border-gray-200 bg-white p-4 text-left shadow-sm transition-colors active:bg-gray-50 dark:border-neutral-800 dark:bg-neutral-950 dark:active:bg-neutral-800"
    >
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex items-center gap-3 text-xs text-gray-400 dark:text-neutral-500">
            <span>{formatTimeDisplay(item.updateTime)}</span>
          </div>
          {item.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {item.tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs text-gray-600 dark:bg-neutral-800 dark:text-neutral-400"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
          }}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-gray-400 transition-colors active:bg-gray-100 dark:text-neutral-500 dark:active:bg-neutral-800"
          aria-label="更多操作"
        >
          <IconMore />
        </button>
      </div>

      <div className="pointer-events-none">
        {editorContent.length > 0 ? (
          <Editor
            className="overflow-hidden"
            readonly={true}
            initValue={editorContent}
            theme={theme}
            extensions={mobileCardPreviewExtensions}
          />
        ) : (
          <p className="line-clamp-1 text-[15px] font-medium text-gray-900 dark:text-neutral-100">
            {item.excerpt?.split("\n")[0] || `卡片 #${item.id}`}
          </p>
        )}
      </div>
    </button>
  );
});

export default CardItem;
