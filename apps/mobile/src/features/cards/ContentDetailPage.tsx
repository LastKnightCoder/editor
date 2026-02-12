import { useEffect, useMemo, useState, type ComponentProps } from "react";
import { Editor } from "@tau/editor/src";
import type { Descendant } from "slate";
import * as tauri from "../../services/tauri";
import type { ContentDetailResponse } from "../../types";
import { useMobileTheme } from "../../hooks/useMobileTheme";
import { mobileCardPreviewExtensions } from "./editorExtensions";

type EditorDocument = ComponentProps<typeof Editor>["initValue"];

const EMPTY_EDITOR_CONTENT: EditorDocument = [
  {
    type: "paragraph",
    children: [{ type: "formatted", text: "" }],
  },
];

type ContentDetailPageProps = {
  contentId: number;
  contentTitle?: string;
  contentType?: string;
  refId?: number;
  onBack: () => void;
  onError?: (error: unknown, fallback: string) => void;
};

function IconChevronLeft() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="15 18 9 12 15 6" />
    </svg>
  );
}

function normalizeTimestamp(value: number): number {
  return value > 0 && value < 1_000_000_000_000 ? value * 1000 : value;
}

function formatTimeLabel(value: number): string {
  if (!value) {
    return "--";
  }
  return new Date(normalizeTimestamp(value)).toLocaleString();
}

function normalizeEditorContent(content: unknown): EditorDocument {
  if (!Array.isArray(content) || content.length === 0) {
    return EMPTY_EDITOR_CONTENT;
  }
  return content as Descendant[] as EditorDocument;
}

function resolveTitle(props: {
  contentTitle?: string;
  detail: ContentDetailResponse | null;
  contentId: number;
}): string {
  if (props.contentTitle?.trim()) {
    return props.contentTitle.trim();
  }
  const category = props.detail?.card?.category?.trim();
  if (category) {
    return `${category} 内容`;
  }
  return `内容 #${props.contentId}`;
}

export function ContentDetailPage(props: ContentDetailPageProps) {
  const { theme } = useMobileTheme();
  const [loading, setLoading] = useState(false);
  const [detail, setDetail] = useState<ContentDetailResponse | null>(null);
  const content = useMemo(
    () => normalizeEditorContent(detail?.content),
    [detail?.content],
  );

  useEffect(() => {
    let cancelled = false;
    if (props.contentId <= 0) {
      setDetail(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setDetail(null);
    tauri
      .getContentDetail(props.contentId)
      .then((result) => {
        if (cancelled) return;
        setDetail(result);
      })
      .catch((error) => {
        if (cancelled) return;
        props.onError?.(error, "内容详情加载失败");
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [props.contentId, props.onError]);

  const title = resolveTitle({
    contentTitle: props.contentTitle,
    detail,
    contentId: props.contentId,
  });

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-gray-50 dark:bg-black">
      <header className="flex h-14 items-center border-b border-gray-100 bg-white px-2 pt-safe dark:border-neutral-900 dark:bg-black">
        <button
          type="button"
          onClick={props.onBack}
          className="flex h-10 w-10 items-center justify-center rounded-full text-gray-600 transition-colors active:bg-gray-100 dark:text-neutral-300 dark:active:bg-neutral-800"
        >
          <IconChevronLeft />
        </button>
        <h1 className="line-clamp-1 flex-1 px-2 text-center text-base font-semibold text-gray-900 dark:text-neutral-100">
          {title}
        </h1>
        <div className="w-10" />
      </header>

      <div className="flex-1 overflow-y-auto p-4">
        {loading ? (
          <div className="space-y-3">
            <div className="h-5 w-2/5 animate-pulse rounded bg-gray-100 dark:bg-neutral-800" />
            <div className="h-4 w-4/5 animate-pulse rounded bg-gray-100 dark:bg-neutral-800" />
            <div className="h-4 w-full animate-pulse rounded bg-gray-100 dark:bg-neutral-800" />
            <div className="h-4 w-3/4 animate-pulse rounded bg-gray-100 dark:bg-neutral-800" />
          </div>
        ) : detail ? (
          <div className="space-y-3">
            <div className="rounded-lg bg-white p-3 dark:bg-neutral-950">
              <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                <span>{formatTimeLabel(detail.updateTime)}</span>
                <span>·</span>
                <span>{detail.count} 字</span>
                {props.contentType ? (
                  <>
                    <span>·</span>
                    <span>{props.contentType}</span>
                  </>
                ) : null}
                {typeof props.refId === "number" && props.refId > 0 ? (
                  <>
                    <span>·</span>
                    <span>Ref #{props.refId}</span>
                  </>
                ) : null}
              </div>
            </div>

            {detail.card?.tags && detail.card.tags.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {detail.card.tags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs text-gray-600 dark:bg-neutral-800 dark:text-neutral-400"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            ) : null}

            {detail.card?.links && detail.card.links.length > 0 ? (
              <div className="rounded-lg bg-gray-50 px-3 py-2.5 dark:bg-neutral-900">
                <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-gray-400 dark:text-gray-500">
                  关联
                </p>
                <div className="space-y-1">
                  {detail.card.links.slice(0, 8).map((link) => (
                    <p
                      key={link}
                      className="truncate text-xs text-gray-600 dark:text-neutral-300"
                      title={link}
                    >
                      {link}
                    </p>
                  ))}
                  {detail.card.links.length > 8 ? (
                    <p className="text-xs text-gray-400 dark:text-gray-500">
                      +{detail.card.links.length - 8} 个关联
                    </p>
                  ) : null}
                </div>
              </div>
            ) : null}

            <div className="rounded-lg bg-white p-3 dark:bg-neutral-950">
              <Editor
                key={`${detail.contentId}-${detail.updateTime}`}
                initValue={content}
                readonly
                theme={theme}
                extensions={mobileCardPreviewExtensions}
              />
            </div>
          </div>
        ) : (
          <div className="py-12 text-center">
            <p className="text-sm text-gray-400 dark:text-gray-500">
              无可展示内容
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export default ContentDetailPage;
