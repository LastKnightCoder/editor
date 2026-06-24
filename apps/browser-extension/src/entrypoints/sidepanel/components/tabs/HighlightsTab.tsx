import { useState, useEffect, useCallback, useRef } from "react";
import {
  Trash2,
  MessageSquare,
  Highlighter,
  ChevronRight,
  ChevronDown,
} from "lucide-react";
import type {
  PageHighlights,
  HighlightStyle,
  HighlightColor,
  Annotation,
} from "../../../../content/types";
import {
  HIGHLIGHT_COLORS,
  HIGHLIGHT_BG_COLORS,
  STORAGE_KEY_PREFIX,
} from "../../../../content/types";
import {
  getPageHighlights,
  savePageHighlightsImmediate,
} from "../../../../content/storage";

const COLORS: HighlightColor[] = ["pink", "purple", "blue", "green", "orange"];

const STYLE_LIST: HighlightStyle[] = ["marker", "straight", "wavy", "dashed"];

/** 将时间戳格式化为相对时间（刚刚 / 3 分钟前 / 2 小时前 / 昨天 / 3 天前 / 1 月12 日） */
function formatRelativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  if (m < 1) return "刚刚";
  if (m < 60) return `${m} 分钟前`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} 小时前`;
  const d = Math.floor(h / 24);
  if (d === 1) return "昨天";
  if (d < 7) return `${d} 天前`;
  const w = Math.floor(d / 7);
  if (w < 5) return `${w} 周前`;
  const date = new Date(ts);
  return `${date.getMonth() + 1}月${date.getDate()}日`;
}

interface HighlightsTabProps {
  url: string | null;
  /** 高亮数量变化时回调，供外部（如 TabBar 徽标）使用 */
  onCountChange?: (count: number) => void;
}

/**
 * 为引用原文生成实际高亮效果的内联样式。
 * marker -> 半透明背景；其余 -> 真实下划线样式。
 */
function getTextStyle(
  style: HighlightStyle,
  color: HighlightColor,
): React.CSSProperties {
  if (style === "marker") {
    return {
      backgroundColor: HIGHLIGHT_BG_COLORS[color],
      borderRadius: 3,
      padding: "1px 4px",
      // 在 marker 模式下将行内装饰线清除
      textDecoration: "none",
    };
  }
  const decoStyle: Record<HighlightStyle, string> = {
    marker: "none",
    straight: "solid",
    wavy: "wavy",
    dashed: "dashed",
  };
  return {
    textDecorationLine: "underline",
    textDecorationStyle: decoStyle[style] as any,
    textDecorationColor: HIGHLIGHT_COLORS[color],
    textUnderlineOffset: "3px",
    textDecorationThickness: style === "dashed" ? "1.5px" : "2px",
    backgroundColor: "transparent",
  };
}

/**
 * 样式选择器 SVG 图标，替代原来的 CSS borderBottom 预览。
 * 使用与 FloatingToolbar 一致的 SVG 路径，确保各样式图标清晰可见。
 */
function StyleIcon({ style, color }: { style: HighlightStyle; color: string }) {
  const props = {
    width: 16,
    height: 16,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: color,
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };

  switch (style) {
    case "marker":
      return (
        <svg {...props}>
          <path d="M12 20h9" />
          <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
        </svg>
      );
    case "wavy":
      return (
        <svg {...props}>
          <path d="M2 17c2-2 4-2 6 0s4 2 6 0 4-2 6 0" />
        </svg>
      );
    case "straight":
      return (
        <svg {...props}>
          <path d="M2 17h20" />
        </svg>
      );
    case "dashed":
      return (
        <svg {...props} strokeDasharray="4 3">
          <path d="M2 17h20" />
        </svg>
      );
  }
}

export default function HighlightsTab({
  url,
  onCountChange,
}: HighlightsTabProps) {
  const [pageData, setPageData] = useState<PageHighlights | null>(null);
  const pageDataRef = useRef<PageHighlights | null>(null);

  // 当前展开编辑的高亮 ID
  const [expandedId, setExpandedId] = useState<string | null>(null);
  // 正在编辑想法的高亮 ID
  const [editingThoughtId, setEditingThoughtId] = useState<string | null>(null);
  const [thoughtText, setThoughtText] = useState("");

  // 保持 ref 同步
  useEffect(() => {
    pageDataRef.current = pageData;
  }, [pageData]);

  // 高亮数量变化时上报（单一数据源，自动响应 storage.onChanged）
  useEffect(() => {
    onCountChange?.(pageData?.highlights.length ?? 0);
  }, [pageData, onCountChange]);

  // 加载当前页面的高亮数据
  useEffect(() => {
    if (!url) {
      setPageData(null);
      return;
    }
    getPageHighlights(url).then((data) => {
      setPageData(data);
    });
  }, [url]);

  // 监听 storage 变更，实时同步页面端的编辑
  useEffect(() => {
    if (!url) return;
    const normalizedUrl = url.split("#")[0];
    const key = `${STORAGE_KEY_PREFIX}${normalizedUrl}`;

    const handler = (changes: {
      [key: string]: chrome.storage.StorageChange;
    }) => {
      if (!changes[key]?.newValue) return;
      const newData = changes[key].newValue as PageHighlights;
      const currentData = pageDataRef.current;

      const isSelfTriggered =
        currentData &&
        JSON.stringify(currentData.highlights) ===
          JSON.stringify(newData.highlights) &&
        JSON.stringify(currentData.annotations) ===
          JSON.stringify(newData.annotations);

      if (isSelfTriggered) return;
      setPageData(newData);
    };

    chrome.storage.onChanged.addListener(handler);
    return () => chrome.storage.onChanged.removeListener(handler);
  }, [url]);

  // 更新数据并立即持久化
  const updatePageData = useCallback(
    async (updater: (prev: PageHighlights) => PageHighlights) => {
      if (!url) return;
      const base: PageHighlights = pageDataRef.current ?? {
        url: url.split("#")[0],
        highlights: [],
        annotations: {},
        version: 1,
      };
      const next = updater(base);
      setPageData(next);
      await savePageHighlightsImmediate(next);
    },
    [url],
  );

  // 滚动到页面对应高亮
  const scrollToHighlight = useCallback(async (highlightId: string) => {
    try {
      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });
      if (tab?.id) {
        chrome.tabs.sendMessage(tab.id, {
          type: "TAU_SCROLL_TO_HIGHLIGHT",
          highlightId,
        });
      }
    } catch (error) {
      console.error("滚动到高亮失败:", error);
    }
  }, []);

  const updateHighlightStyle = useCallback(
    (highlightId: string, style: HighlightStyle) => {
      updatePageData((prev) => ({
        ...prev,
        highlights: prev.highlights.map((h) =>
          h.id === highlightId ? { ...h, style } : h,
        ),
      }));
    },
    [updatePageData],
  );

  const updateHighlightColor = useCallback(
    (highlightId: string, color: HighlightColor) => {
      updatePageData((prev) => ({
        ...prev,
        highlights: prev.highlights.map((h) =>
          h.id === highlightId ? { ...h, color } : h,
        ),
      }));
    },
    [updatePageData],
  );

  const deleteHighlight = useCallback(
    (highlightId: string) => {
      updatePageData((prev) => {
        const { [highlightId]: _, ...restAnnotations } = prev.annotations;
        return {
          ...prev,
          highlights: prev.highlights.filter((h) => h.id !== highlightId),
          annotations: restAnnotations,
        };
      });
      if (expandedId === highlightId) setExpandedId(null);
      if (editingThoughtId === highlightId) setEditingThoughtId(null);
    },
    [updatePageData, expandedId, editingThoughtId],
  );

  const saveAnnotation = useCallback(
    (highlightId: string, text: string) => {
      updatePageData((prev) => {
        const trimmed = text.trim();
        if (trimmed) {
          const existing = prev.annotations[highlightId];
          const annotation: Annotation = existing
            ? { ...existing, text: trimmed, updatedAt: Date.now() }
            : {
                highlightId,
                text: trimmed,
                isPublic: false,
                createdAt: Date.now(),
                updatedAt: Date.now(),
              };
          return {
            ...prev,
            annotations: { ...prev.annotations, [highlightId]: annotation },
          };
        }
        const { [highlightId]: _, ...rest } = prev.annotations;
        return { ...prev, annotations: rest };
      });
      setEditingThoughtId(null);
    },
    [updatePageData],
  );

  const startEditThought = useCallback((highlightId: string) => {
    const annotation = pageDataRef.current?.annotations[highlightId];
    setEditingThoughtId(highlightId);
    setThoughtText(annotation?.text ?? "");
  }, []);

  // --- 空状态 ---

  if (!url) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center px-6 py-16">
        <p className="text-sm text-gray-400 dark:text-[#484f58]">
          等待页面加载...
        </p>
      </div>
    );
  }

  const highlights = pageData?.highlights ?? [];
  const annotations = pageData?.annotations ?? {};

  if (highlights.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center px-6 py-16">
        <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-linear-to-br from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20">
          <Highlighter size={28} className="text-blue-400 dark:text-blue-500" />
        </div>
        <p className="text-sm font-medium text-gray-500 dark:text-[#8b949e]">
          还没有高亮标记
        </p>
        <p className="mt-1 text-xs text-gray-400 dark:text-[#484f58]">
          在页面中选取文字即可添加高亮
        </p>
      </div>
    );
  }

  const sortedHighlights = [...highlights].sort(
    (a, b) => b.createdAt - a.createdAt,
  );

  return (
    <div className="tau-scrollbar flex h-full flex-col overflow-y-auto bg-[var(--sb-surface)]">
      {/* 标题栏 */}
      <div className="flex items-center justify-between px-4 pb-1 pt-3">
        <span className="text-xs font-medium tracking-wide text-gray-400 dark:text-[#484f58]">
          {highlights.length} 条高亮
        </span>
      </div>

      {/* 高亮列表 */}
      <div className="flex flex-col gap-2.5 px-3 pb-4 pt-1">
        {sortedHighlights.map((highlight) => {
          const annotation = annotations[highlight.id];
          const isExpanded = expandedId === highlight.id;
          const isEditingThought = editingThoughtId === highlight.id;

          return (
            <div
              key={highlight.id}
              className={`group relative overflow-hidden rounded-xl border border-[var(--sb-card-border)] bg-[var(--sb-card-bg)] transition-all duration-200 ${
                isExpanded
                  ? "shadow-[var(--sb-card-shadow-expanded)]"
                  : "shadow-[var(--sb-card-shadow)] hover:shadow-[var(--sb-card-shadow-hover)]"
              }`}
            >
              {/* 左侧色条 */}
              <div
                className="absolute bottom-0 left-0 top-0 w-[4px]"
                style={{ backgroundColor: HIGHLIGHT_COLORS[highlight.color] }}
              />

              {/* 卡片主体：点击 = 仅滚动定位到页面高亮处 */}
              <div
                className="cursor-pointer py-3 pl-4 pr-3"
                onClick={() => scrollToHighlight(highlight.id)}
              >
                {/* 原文：直接用实际高亮样式渲染 */}
                <p className="text-[13px] leading-[1.7] text-gray-800 dark:text-[#e6edf3]">
                  <span style={getTextStyle(highlight.style, highlight.color)}>
                    {highlight.range.text}
                  </span>
                </p>

                {/* 想法预览（折叠态）：点击展开 */}
                {annotation && !isExpanded && (
                  <p
                    className="mt-2 line-clamp-2 border-l-2 border-gray-200 pl-2.5 text-xs leading-relaxed text-gray-400 transition-colors hover:border-gray-300 hover:text-gray-500 dark:border-[#30363d] dark:text-[#8b949e] dark:hover:border-[#484f58] dark:hover:text-[#adbac7]"
                    onClick={(e) => {
                      e.stopPropagation();
                      setExpandedId(highlight.id);
                    }}
                  >
                    {annotation.text}
                  </p>
                )}

                {/* 底部 meta 行（折叠态）：左=相对时间，右=展开按钮 */}
                {!isExpanded && (
                  <div className="mt-2 flex items-center justify-between">
                    <span className="text-[11px] leading-none text-gray-300 dark:text-[#484f58]">
                      {formatRelativeTime(highlight.createdAt)}
                    </span>
                    <button
                      className="flex h-5 w-5 items-center justify-center rounded text-gray-300 transition-colors hover:bg-gray-100 hover:text-gray-500 dark:text-[#484f58] dark:hover:bg-white/8 dark:hover:text-[#8b949e]"
                      onClick={(e) => {
                        e.stopPropagation();
                        setExpandedId(highlight.id);
                      }}
                      title="编辑"
                    >
                      <ChevronRight size={14} />
                    </button>
                  </div>
                )}
              </div>

              {/* 展开的编辑区域 */}
              {isExpanded && (
                <div className="border-t border-gray-100 px-4 pb-3 pt-2.5 dark:border-[#30363d]/60">
                  {/* 顶部 meta 行：时间 + 收起按钮 */}
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-[11px] leading-none text-gray-300 dark:text-[#484f58]">
                      {formatRelativeTime(highlight.createdAt)}
                    </span>
                    <button
                      className="flex h-5 w-5 items-center justify-center rounded text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:text-[#8b949e] dark:hover:bg-white/8 dark:hover:text-[#adbac7]"
                      onClick={(e) => {
                        e.stopPropagation();
                        setExpandedId(null);
                        setEditingThoughtId(null);
                      }}
                      title="收起"
                    >
                      <ChevronDown size={14} />
                    </button>
                  </div>

                  {/* 颜色 + 样式选择行 */}
                  <div className="flex items-center gap-2.5">
                    {/* 颜色选择 */}
                    <div className="flex items-center gap-2">
                      {COLORS.map((c) => (
                        <button
                          key={c}
                          className="group/dot flex h-6 w-6 items-center justify-center"
                          onClick={() => updateHighlightColor(highlight.id, c)}
                        >
                          <span
                            className={`flex items-center justify-center rounded-full transition-all duration-150 ${
                              highlight.color === c
                                ? "h-5 w-5"
                                : "h-[14px] w-[14px] group-hover/dot:h-4 group-hover/dot:w-4"
                            }`}
                            style={{ backgroundColor: HIGHLIGHT_COLORS[c] }}
                          >
                            {highlight.color === c && (
                              <span className="block h-[6px] w-[6px] rounded-full bg-white/90" />
                            )}
                          </span>
                        </button>
                      ))}
                    </div>

                    {/* 分隔线 */}
                    <div className="h-4 w-px bg-gray-200 dark:bg-[#30363d]" />

                    {/* 样式选择 */}
                    <div className="flex items-center gap-0.5">
                      {STYLE_LIST.map((s) => (
                        <button
                          key={s}
                          className={`flex h-7 w-8 items-center justify-center rounded-md transition-colors ${
                            highlight.style === s
                              ? "bg-gray-100 dark:bg-white/10"
                              : "hover:bg-gray-50 dark:hover:bg-white/5"
                          }`}
                          onClick={() => updateHighlightStyle(highlight.id, s)}
                        >
                          <StyleIcon
                            style={s}
                            color={
                              highlight.style === s
                                ? HIGHLIGHT_COLORS[highlight.color]
                                : "#9ca3af"
                            }
                          />
                        </button>
                      ))}
                    </div>

                    {/* 弹性间隔 */}
                    <div className="flex-1" />

                    {/* 删除按钮 */}
                    <button
                      className="flex h-7 w-7 items-center justify-center rounded-md text-gray-300 transition-colors hover:bg-red-50 hover:text-red-400 dark:text-[#484f58] dark:hover:bg-red-900/20 dark:hover:text-red-400"
                      onClick={() => deleteHighlight(highlight.id)}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>

                  {/* 想法区域 */}
                  <div className="mt-2.5">
                    {isEditingThought ? (
                      <div className="flex flex-col gap-2">
                        <textarea
                          className="w-full resize-none rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-[13px] leading-relaxed text-gray-700 outline-none transition-colors placeholder:text-gray-300 focus:border-gray-300 focus:bg-white dark:border-[#30363d] dark:bg-[#0d1117] dark:text-[#c9d1d9] dark:placeholder:text-[#484f58] dark:focus:border-[#484f58] dark:focus:bg-[#161b22]"
                          placeholder="写点什么呢？"
                          value={thoughtText}
                          onChange={(e) => setThoughtText(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && !e.shiftKey) {
                              e.preventDefault();
                              saveAnnotation(highlight.id, thoughtText);
                            }
                            if (e.key === "Escape") {
                              setEditingThoughtId(null);
                            }
                          }}
                          rows={2}
                          autoFocus
                        />
                        <div className="flex justify-end gap-1.5">
                          <button
                            className="rounded-md px-3 py-1 text-xs text-gray-400 transition-colors hover:text-gray-600 dark:text-[#6e7681] dark:hover:text-[#8b949e]"
                            onClick={() => setEditingThoughtId(null)}
                          >
                            取消
                          </button>
                          <button
                            className="rounded-md px-3 py-1 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-100 disabled:opacity-40 dark:text-[#8b949e] dark:hover:bg-white/8"
                            disabled={!thoughtText.trim()}
                            onClick={() =>
                              saveAnnotation(highlight.id, thoughtText)
                            }
                          >
                            保存
                          </button>
                        </div>
                      </div>
                    ) : annotation ? (
                      <div
                        className="cursor-pointer rounded-lg border border-gray-100 bg-gray-50/50 px-3 py-2 text-[13px] leading-relaxed text-gray-500 transition-colors hover:bg-gray-100/80 dark:border-[#30363d]/60 dark:bg-[#0d1117]/40 dark:text-[#8b949e] dark:hover:bg-[#0d1117]/80"
                        onClick={(e) => {
                          e.stopPropagation();
                          startEditThought(highlight.id);
                        }}
                      >
                        {annotation.text}
                      </div>
                    ) : (
                      <button
                        className="flex items-center gap-1.5 rounded-md px-1 py-1 text-xs text-gray-300 transition-colors hover:text-gray-500 dark:text-[#484f58] dark:hover:text-[#8b949e]"
                        onClick={(e) => {
                          e.stopPropagation();
                          startEditThought(highlight.id);
                        }}
                      >
                        <MessageSquare size={12} />
                        <span>添加想法</span>
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
