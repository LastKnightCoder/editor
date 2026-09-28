import { useMemo, useState, memo } from "react";
import { getDesktopKit } from "@/services/editorKit";
import classNames from "classnames";
import { Empty, Button, App, Dropdown } from "antd";
import type { MenuProps } from "antd";
import { useMemoizedFn } from "ahooks";
import type { PdfBookmarkObject } from "@embedpdf/models";
import { PdfActionType } from "@embedpdf/models";
import type { LucideIcon } from "lucide-react";
import {
  ListTreeIcon,
  BookmarkIcon,
  StickyNoteIcon,
  ImagesIcon,
  MoreHorizontalIcon,
  ChevronRightIcon,
  SearchIcon,
} from "lucide-react";
import { Editor } from "@tau/editor/src";
import useThemeColors from "@/hooks/useThemeColors";
import { formatAnnotationSnippet } from "../utils/annotation";
import type { PdfAnnotation, PdfBookmark, PdfIndexStatus, PdfSearchResult } from "@/types";
import PdfEmbedThumbnails from "./Thumbnails";

export type SidebarTabKey = "outline" | "search" | "thumbnails" | "bookmarks" | "notes";

const SIDEBAR_TABS: Array<{
  key: SidebarTabKey;
  label: string;
  icon: LucideIcon;
}> = [
  { key: "outline", label: "目录", icon: ListTreeIcon },
  { key: "search", label: "搜索", icon: SearchIcon },
  { key: "thumbnails", label: "缩略图", icon: ImagesIcon },
  { key: "bookmarks", label: "书签", icon: BookmarkIcon },
  { key: "notes", label: "笔记", icon: StickyNoteIcon },
];

interface PdfEmbedSidebarProps {
  activeTab: SidebarTabKey;
  onTabChange: (key: SidebarTabKey) => void;
  outline: PdfBookmarkObject[];
  onOutlineSelect?: (bookmark: PdfBookmarkObject) => void;
  bookmarks: PdfBookmark[];
  onBookmarkSelect?: (bookmark: PdfBookmark) => void;
  onBookmarkDelete?: (bookmark: PdfBookmark) => void;
  annotations: PdfAnnotation[];
  onAnnotationDelete?: (annotation: PdfAnnotation) => void;
  onAnnotationClick?: (annotation: PdfAnnotation) => void;
  onAnnotationEdit?: (annotation: PdfAnnotation) => void;
  searchQuery: string;
  lastSearchQuery?: string;
  onSearchQueryChange: (query: string) => void;
  onSearchSubmit: () => void;
  searchResults: PdfSearchResult[];
  selectedSearchResultKey?: string | null;
  onSearchResultSelect: (result: PdfSearchResult) => void;
  searchLoading?: boolean;
  indexStatus?: PdfIndexStatus | null;
}

const getDestinationPage = (bookmark: PdfBookmarkObject): number | null => {
  if (!bookmark.target) return null;

  // 处理 destination 类型
  if (bookmark.target.type === "destination") {
    const pageIndex = bookmark.target.destination?.pageIndex;
    return pageIndex != null ? pageIndex + 1 : null;
  }

  // 处理 action 类型 (Goto, RemoteGoto)
  if (bookmark.target.type === "action") {
    const action = bookmark.target.action;
    if (action.type === PdfActionType.Goto || action.type === PdfActionType.RemoteGoto) {
      const pageIndex = action.destination?.pageIndex;
      return pageIndex != null ? pageIndex + 1 : null;
    }
  }

  return null;
};

// 目录项组件
interface OutlineItemProps {
  item: PdfBookmarkObject;
  level: number;
  onSelect: (bookmark: PdfBookmarkObject) => void;
  expandedKeys: Set<string>;
  onToggle: (key: string) => void;
  themeColors: ReturnType<typeof useThemeColors>;
  itemKey: string;
}

const OutlineItem = memo(
  ({ item, level, onSelect, expandedKeys, onToggle, themeColors, itemKey }: OutlineItemProps) => {
    const hasChildren = item.children && item.children.length > 0;
    const isExpanded = expandedKeys.has(itemKey);
    const page = getDestinationPage(item);

    return (
      <div className="select-none">
        <div
          className={classNames(
            "group flex cursor-pointer items-center gap-2 rounded-lg px-2 py-2 transition-all duration-150",
            themeColors.hoverClass
          )}
          style={{ paddingLeft: `${level * 16 + 8}px` }}
          onClick={() => onSelect(item)}
        >
          {/* 展开/折叠按钮 */}
          <button
            type="button"
            className={classNames(
              "flex h-5 w-5 shrink-0 items-center justify-center rounded transition-all duration-200",
              hasChildren ? "opacity-100" : "pointer-events-none opacity-0",
              themeColors.secondaryTextClass
            )}
            onClick={e => {
              e.stopPropagation();
              if (hasChildren) {
                onToggle(itemKey);
              }
            }}
          >
            <ChevronRightIcon
              size={14}
              className={classNames("transition-transform duration-200", isExpanded && "rotate-90")}
            />
          </button>

          {/* 标题 */}
          <span
            className={classNames(
              "flex-1 truncate text-[13px] leading-relaxed",
              themeColors.textClass
            )}
            title={item.title}
          >
            {item.title || `章节`}
          </span>

          {/* 页码 - 仅在有效时显示 */}
          {page != null && (
            <span
              className={classNames(
                "shrink-0 text-[11px] opacity-0 transition-opacity group-hover:opacity-100",
                themeColors.secondaryTextClass
              )}
            >
              P{page}
            </span>
          )}
        </div>

        {/* 子项 */}
        {hasChildren && (
          <div
            className={classNames(
              "overflow-hidden transition-all duration-200",
              isExpanded ? "max-h-[9999px] opacity-100" : "max-h-0 opacity-0"
            )}
          >
            {(item.children || []).map((child, index) => (
              <OutlineItem
                key={`${itemKey}-${index}`}
                item={child}
                level={level + 1}
                onSelect={onSelect}
                expandedKeys={expandedKeys}
                onToggle={onToggle}
                themeColors={themeColors}
                itemKey={`${itemKey}-${index}`}
              />
            ))}
          </div>
        )}
      </div>
    );
  }
);

OutlineItem.displayName = "OutlineItem";

// 收集所有有子节点的 key
const collectExpandableKeys = (outline: PdfBookmarkObject[], prefix = "outline"): string[] => {
  const keys: string[] = [];
  outline.forEach((item, index) => {
    const key = `${prefix}-${index}`;
    if (item.children && item.children.length > 0) {
      keys.push(key);
      keys.push(...collectExpandableKeys(item.children, key));
    }
  });
  return keys;
};

const OutlineTab = ({
  outline,
  onOutlineSelect,
  themeColors,
}: {
  outline: PdfBookmarkObject[];
  onOutlineSelect?: (bookmark: PdfBookmarkObject) => void;
  themeColors: ReturnType<typeof useThemeColors>;
}) => {
  // 默认展开所有节点
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(() => {
    return new Set(collectExpandableKeys(outline));
  });

  const handleToggle = useMemoizedFn((key: string) => {
    setExpandedKeys(prev => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  });

  const handleSelect = useMemoizedFn((bookmark: PdfBookmarkObject) => {
    onOutlineSelect?.(bookmark);
  });

  if (!outline.length) {
    return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="此 PDF 未提供目录" />;
  }

  return (
    <div className="py-1">
      {outline.map((item, index) => (
        <OutlineItem
          key={`outline-${index}`}
          item={item}
          level={0}
          onSelect={handleSelect}
          expandedKeys={expandedKeys}
          onToggle={handleToggle}
          themeColors={themeColors}
          itemKey={`outline-${index}`}
        />
      ))}
    </div>
  );
};

const BookmarksTab = ({
  bookmarks,
  onSelect,
  onDelete,
  themeColors,
}: {
  bookmarks: PdfBookmark[];
  onSelect?: (bookmark: PdfBookmark) => void;
  onDelete?: (bookmark: PdfBookmark) => void;
  themeColors: ReturnType<typeof useThemeColors>;
}) => {
  if (!bookmarks.length) {
    return (
      <div className="pdf-embed-sidebar-placeholder py-8">
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无书签" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-0">
      {bookmarks.map(bookmark => {
        const page = getDestinationPage(bookmark.bookmark);
        return (
          <div
            key={bookmark.id}
            className={classNames(
              "flex items-start justify-between gap-2 border-b py-2.5",
              themeColors.borderClass
            )}
          >
            <div className="flex-1 cursor-pointer" onClick={() => onSelect?.(bookmark)}>
              <div className="font-medium">{bookmark.bookmark.title || `书签 第${page} 页`}</div>
              <div className={classNames("text-xs", themeColors.secondaryTextClass)}>
                第 {page} 页
              </div>
            </div>
            <Button size="small" type="text" danger onClick={() => onDelete?.(bookmark)}>
              删除
            </Button>
          </div>
        );
      })}
    </div>
  );
};

const NotesTab = ({
  annotations,
  onDeleteAnnotation,
  onAnnotationClick,
  onAnnotationEdit,
  themeColors,
}: {
  annotations: PdfAnnotation[];
  onDeleteAnnotation?: (annotation: PdfAnnotation) => void;
  onAnnotationClick?: (annotation: PdfAnnotation) => void;
  onAnnotationEdit?: (annotation: PdfAnnotation) => void;
  themeColors: ReturnType<typeof useThemeColors>;
}) => {
  const { modal } = App.useApp();

  // 按页面顺序排序标注
  const sortedAnnotations = useMemo(() => {
    return [...annotations].sort((a, b) => {
      // 获取页面索引
      const pageA =
        a.type === "area" ? (a.areaData?.pageIndex ?? 0) : (a.annotation?.pageIndex ?? 0);
      const pageB =
        b.type === "area" ? (b.areaData?.pageIndex ?? 0) : (b.annotation?.pageIndex ?? 0);

      if (pageA !== pageB) return pageA - pageB;

      // 同一页面按 Y 坐标排序
      const yA =
        a.type === "area" ? (a.areaData?.rect.y ?? 0) : (a.annotation?.rect?.origin?.y ?? 0);
      const yB =
        b.type === "area" ? (b.areaData?.rect.y ?? 0) : (b.annotation?.rect?.origin?.y ?? 0);

      return yA - yB;
    });
  }, [annotations]);

  const handleDelete = (annotation: PdfAnnotation) => {
    modal.confirm({
      title: "确认删除",
      content: "确定要删除此标注及其笔记吗？此操作无法撤销。",
      okText: "删除",
      okType: "danger",
      cancelText: "取消",
      onOk: () => {
        onDeleteAnnotation?.(annotation);
      },
    });
  };

  const getMenuItems = (annotation: PdfAnnotation): MenuProps["items"] => {
    const hasNote = annotation.notes?.[0]?.note && annotation.notes[0].note.length > 0;
    return [
      {
        key: "edit",
        label: hasNote ? "编辑笔记" : "添加笔记",
        onClick: () => onAnnotationEdit?.(annotation),
      },
      {
        type: "divider",
      },
      {
        key: "delete",
        label: "删除标注",
        danger: true,
        onClick: () => handleDelete(annotation),
      },
    ];
  };

  if (!sortedAnnotations.length) {
    return (
      <div className="pdf-embed-sidebar-placeholder py-8">
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无标注" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {sortedAnnotations.map(annotation => {
        const note = annotation.notes?.[0];
        const hasNote = note?.note && note.note.length > 0;
        const isAreaAnnotation = annotation.type === "area";
        const quote = isAreaAnnotation ? null : formatAnnotationSnippet(annotation.annotation);
        const pageIndex = isAreaAnnotation
          ? (annotation.areaData?.pageIndex ?? 0)
          : (annotation.annotation?.pageIndex ?? 0);

        return (
          <div
            key={annotation.id}
            className={classNames(
              "relative cursor-pointer rounded-xl border p-3 shadow-sm transition-shadow hover:shadow-md",
              themeColors.cardBorderClass
            )}
            onClick={() => onAnnotationClick?.(annotation)}
          >
            {/* 右上角 More 菜单 */}
            <Dropdown
              menu={{ items: getMenuItems(annotation) }}
              trigger={["click"]}
              placement="bottomRight"
            >
              <button
                type="button"
                className={classNames(
                  "absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-md bg-transparent opacity-0 transition-all hover:opacity-100",
                  themeColors.textClass,
                  themeColors.hoverClass
                )}
                onClick={e => e.stopPropagation()}
              >
                <MoreHorizontalIcon size={16} />
              </button>
            </Dropdown>

            {/* 引用区域 - 区域标注显示截图，文本标注显示文字 */}
            <div
              className={classNames(
                "mb-2.5 rounded-r-md border-l-[3px] px-2.5 py-2 pl-3",
                "bg-[var(--th-bg-hover)]",
                themeColors.focusBorderClass
              )}
            >
              {isAreaAnnotation && annotation.areaData?.captureUrl ? (
                <div className="rounded bg-white p-1 dark:bg-zinc-900">
                  <img
                    src={annotation.areaData.captureUrl}
                    alt="区域截图"
                    className={classNames(
                      "max-h-[120px] w-full rounded border object-contain",
                      themeColors.borderClass
                    )}
                  />
                </div>
              ) : (
                <span
                  className={classNames(
                    "line-clamp-3 text-xs leading-relaxed",
                    themeColors.textClass
                  )}
                >
                  {quote}
                </span>
              )}
              <div className={classNames("mt-1.5 text-[11px]", themeColors.secondaryTextClass)}>
                第 {pageIndex + 1} 页
              </div>
            </div>

            {/* 用户笔记区域 */}
            <div className="min-h-[24px]">
              {hasNote ? (
                <Editor
                  kit={getDesktopKit()}
                  className="pointer-events-none max-h-20 overflow-hidden text-[13px]"
                  initValue={note.note.slice(0, 2)}
                  readonly
                />
              ) : (
                <span className={classNames("text-xs italic", themeColors.secondaryTextClass)}>
                  点击右上角添加笔记...
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};

const SearchTab = ({
  query,
  lastSearchQuery,
  onQueryChange,
  onSearch,
  results,
  selectedResultKey,
  onResultSelect,
  loading,
  indexStatus,
  themeColors,
}: {
  query: string;
  lastSearchQuery?: string;
  onQueryChange: (query: string) => void;
  onSearch: () => void;
  results: PdfSearchResult[];
  selectedResultKey?: string | null;
  onResultSelect: (result: PdfSearchResult) => void;
  loading?: boolean;
  indexStatus?: PdfIndexStatus | null;
  themeColors: ReturnType<typeof useThemeColors>;
}) => {
  const statusText = useMemo(() => {
    if (!indexStatus) {
      return "等待索引状态...";
    }
    switch (indexStatus.state) {
      case "building":
        return indexStatus.progressLabel || "索引构建中";
      case "ready":
        return `索引已就绪，共 ${indexStatus.pageCount} 页`;
      case "failed":
        return indexStatus.error || "索引构建失败";
      default:
        return "索引尚未构建";
    }
  }, [indexStatus]);

  const emptyDescription = useMemo(() => {
    if (!lastSearchQuery?.trim()) {
      return "输入关键词开始搜索";
    }
    if (indexStatus?.state === "failed") {
      return "索引构建失败，请先检查 PDF 索引状态";
    }
    return `未找到“${lastSearchQuery.trim()}”相关内容，可尝试更短关键词；如果是扫描版 PDF，当前可能没有可检索文本`;
  }, [indexStatus?.state, lastSearchQuery]);

  return (
    <div className="flex flex-col gap-3">
      <div className="space-y-3">
        <div>
          <div className="mb-1 text-xs font-medium">索引状态</div>
          <div className={classNames("text-xs leading-relaxed", themeColors.secondaryTextClass)}>
            {statusText}
          </div>
          {indexStatus?.state === "building" &&
          typeof indexStatus.progressCurrent === "number" &&
          typeof indexStatus.progressTotal === "number" &&
          indexStatus.progressTotal > 0 ? (
            <div className="mt-2">
              <div
                className={classNames(
                  "mb-1 flex items-center justify-between text-[11px]",
                  themeColors.secondaryTextClass
                )}
              >
                <span>{indexStatus.currentStage || "building"}</span>
                <span>
                  {indexStatus.progressCurrent}/{indexStatus.progressTotal}
                </span>
              </div>
              <div className="bg-black/8 h-1.5 overflow-hidden rounded-full dark:bg-white/10">
                <div
                  className="h-full rounded-full bg-[var(--th-info)] transition-[width] duration-200"
                  style={{
                    width: `${Math.max(
                      4,
                      Math.min(100, (indexStatus.progressCurrent / indexStatus.progressTotal) * 100)
                    )}%`,
                  }}
                />
              </div>
            </div>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <input
            value={query}
            onChange={event => onQueryChange(event.target.value)}
            onKeyDown={event => {
              if (event.key === "Enter") {
                onSearch();
              }
            }}
            placeholder="搜索关键字或问题"
            className={classNames(
              "flex-1 rounded-lg border px-3 py-2 text-sm outline-none transition-all",
              themeColors.inputBgClass,
              themeColors.borderClass,
              themeColors.activeTextClass
            )}
          />
          <Button type="primary" loading={loading} onClick={onSearch}>
            搜索
          </Button>
        </div>
      </div>

      {results.length === 0 ? (
        <div className="pdf-embed-sidebar-placeholder py-8">
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={emptyDescription} />
        </div>
      ) : (
        <div className={classNames("border-t pt-2", themeColors.borderClass)}>
          <div className={classNames("px-1 pb-2 text-xs", themeColors.secondaryTextClass)}>
            找到 {results.length} 条结果
          </div>
          {results.map(result => {
            const resultKey = `${result.pageNumber}-${result.chunkIndex}-${result.source}`;
            return (
              <button
                key={resultKey}
                type="button"
                className={classNames(
                  "w-full border-b px-1 py-3 text-left transition-colors",
                  themeColors.borderClass,
                  selectedResultKey === resultKey
                    ? classNames(themeColors.activeTextClass, "bg-transparent")
                    : classNames(themeColors.textClass, themeColors.hoverClass)
                )}
                onClick={() => onResultSelect(result)}
              >
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <span className="text-xs font-medium">第 {result.pageNumber} 页</span>
                  {result.sectionTitle ? (
                    <span
                      className={classNames("truncate text-[11px]", themeColors.secondaryTextClass)}
                      title={
                        result.sectionPath?.length
                          ? result.sectionPath.join(" / ")
                          : result.sectionTitle
                      }
                    >
                      {result.sectionTitle}
                    </span>
                  ) : null}
                </div>
                <div className="line-clamp-3 text-sm leading-6">{result.snippet}</div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

const PdfEmbedSidebar = ({
  activeTab,
  onTabChange,
  outline,
  onOutlineSelect,
  bookmarks,
  onBookmarkSelect,
  onBookmarkDelete,
  annotations,
  onAnnotationDelete,
  onAnnotationClick,
  onAnnotationEdit,
  searchQuery,
  lastSearchQuery,
  onSearchQueryChange,
  onSearchSubmit,
  searchResults,
  selectedSearchResultKey,
  onSearchResultSelect,
  searchLoading,
  indexStatus,
}: PdfEmbedSidebarProps) => {
  const themeColors = useThemeColors();
  const bookmarksCount = bookmarks.length;
  const notesCount = useMemo(() => annotations.length, [annotations]);

  const renderContent = () => {
    switch (activeTab) {
      case "outline":
        return (
          <OutlineTab
            outline={outline}
            onOutlineSelect={onOutlineSelect}
            themeColors={themeColors}
          />
        );
      case "bookmarks":
        return (
          <BookmarksTab
            bookmarks={bookmarks}
            onSelect={onBookmarkSelect}
            onDelete={onBookmarkDelete}
            themeColors={themeColors}
          />
        );
      case "search":
        return (
          <SearchTab
            query={searchQuery}
            lastSearchQuery={lastSearchQuery}
            onQueryChange={onSearchQueryChange}
            onSearch={onSearchSubmit}
            results={searchResults}
            selectedResultKey={selectedSearchResultKey}
            onResultSelect={onSearchResultSelect}
            loading={searchLoading}
            indexStatus={indexStatus}
            themeColors={themeColors}
          />
        );
      case "notes":
        return (
          <NotesTab
            annotations={annotations}
            onDeleteAnnotation={onAnnotationDelete}
            onAnnotationClick={onAnnotationClick}
            onAnnotationEdit={onAnnotationEdit}
            themeColors={themeColors}
          />
        );
      case "thumbnails":
        return (
          <div className="h-full">
            <PdfEmbedThumbnails themeColors={themeColors} />
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div
      className={classNames(
        "relative flex h-full flex-col overflow-hidden border-r",
        themeColors.borderClass
      )}
    >
      <div
        className={classNames("grid grid-cols-5 gap-2 border-b px-3 py-3", themeColors.borderClass)}
      >
        {SIDEBAR_TABS.map(tab => {
          const Icon = tab.icon;
          const count =
            tab.key === "bookmarks" ? bookmarksCount : tab.key === "notes" ? notesCount : 0;
          return (
            <button
              key={tab.key}
              type="button"
              className={classNames(
                "flex flex-col items-center gap-1 rounded-xl bg-transparent px-1.5 py-2 text-xs transition-colors",
                activeTab === tab.key
                  ? themeColors.activeClass
                  : classNames(themeColors.textClass, themeColors.hoverClass)
              )}
              onClick={() => onTabChange(tab.key)}
            >
              <span className="relative flex items-center justify-center">
                <Icon size={16} />
                {count > 0 && (
                  <span
                    className={classNames(
                      "absolute -right-2 -top-1.5 h-4 min-w-[16px] rounded-lg px-1 text-center text-[10px] font-semibold leading-4",
                      themeColors.badgeBgClass,
                      themeColors.badgeTextClass
                    )}
                  >
                    {count}
                  </span>
                )}
              </span>
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>
      <div className="min-h-0 flex-1 overflow-auto px-4 py-3">{renderContent()}</div>
    </div>
  );
};

export default PdfEmbedSidebar;
