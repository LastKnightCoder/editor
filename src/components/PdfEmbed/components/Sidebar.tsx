import { useMemo } from "react";
import classNames from "classnames";
import { Empty, Tree, Button, App, Dropdown } from "antd";
import type { MenuProps } from "antd";
import type { DataNode } from "antd/es/tree";
import type { PdfBookmarkObject } from "@embedpdf/models";
import type { LucideIcon } from "lucide-react";
import {
  ListTreeIcon,
  BookmarkIcon,
  StickyNoteIcon,
  ImagesIcon,
  MoreHorizontalIcon,
  PanelLeftCloseIcon,
} from "lucide-react";
import Editor from "@/components/Editor";
import { formatAnnotationSnippet } from "../utils/annotation";
import type { PdfAnnotation, PdfBookmark } from "@/types";
import PdfEmbedThumbnails from "./Thumbnails";

export type SidebarTabKey = "outline" | "thumbnails" | "bookmarks" | "notes";

const SIDEBAR_TABS: Array<{
  key: SidebarTabKey;
  label: string;
  icon: LucideIcon;
}> = [
  { key: "outline", label: "目录", icon: ListTreeIcon },
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
  onCollapsedChange?: (collapsed: boolean) => void;
}

const convertOutlineToTreeData = (outline: PdfBookmarkObject[]): DataNode[] => {
  return outline.map((item, index) => ({
    key: `${item.title}-${index}`,
    title: item.title || `章节 ${index + 1}`,
    children: item.children ? convertOutlineToTreeData(item.children) : [],
    data: item,
  }));
};

const getDestinationPage = (bookmark: PdfBookmarkObject) => {
  const dest =
    bookmark.target && bookmark.target.type === "destination"
      ? bookmark.target.destination
      : undefined;
  return (dest?.pageIndex ?? 0) + 1 || 1;
};

const OutlineTab = ({
  outline,
  onOutlineSelect,
}: {
  outline: PdfBookmarkObject[];
  onOutlineSelect?: (bookmark: PdfBookmarkObject) => void;
}) => {
  if (!outline.length) {
    return (
      <Empty
        image={Empty.PRESENTED_IMAGE_SIMPLE}
        description="此 PDF 未提供目录"
      />
    );
  }

  return (
    <Tree
      className="pdf-embed-outline-tree"
      treeData={convertOutlineToTreeData(outline)}
      defaultExpandAll
      onSelect={(_keys, { node }) => {
        if (node && "data" in node && onOutlineSelect) {
          const nodeWithData = node as DataNode & { data: PdfBookmarkObject };
          onOutlineSelect(nodeWithData.data);
        }
      }}
    />
  );
};

const BookmarksTab = ({
  bookmarks,
  onSelect,
  onDelete,
}: {
  bookmarks: PdfBookmark[];
  onSelect?: (bookmark: PdfBookmark) => void;
  onDelete?: (bookmark: PdfBookmark) => void;
}) => {
  if (!bookmarks.length) {
    return (
      <div className="pdf-embed-sidebar-placeholder">
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无书签" />
      </div>
    );
  }

  return (
    <div className="pdf-embed-bookmarks">
      {bookmarks.map((bookmark) => {
        const page = getDestinationPage(bookmark.bookmark);
        return (
          <div key={bookmark.id} className="pdf-embed-bookmark-row">
            <div
              className="pdf-embed-bookmark-info"
              onClick={() => onSelect?.(bookmark)}
            >
              <div className="pdf-embed-bookmark-title">
                {bookmark.bookmark.title || `书签 第${page} 页`}
              </div>
              <div className="pdf-embed-bookmark-meta">第 {page} 页</div>
            </div>
            <Button
              size="small"
              type="text"
              danger
              onClick={() => onDelete?.(bookmark)}
            >
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
}: {
  annotations: PdfAnnotation[];
  onDeleteAnnotation?: (annotation: PdfAnnotation) => void;
  onAnnotationClick?: (annotation: PdfAnnotation) => void;
  onAnnotationEdit?: (annotation: PdfAnnotation) => void;
}) => {
  const { modal } = App.useApp();

  // 按页面顺序排序标注
  const sortedAnnotations = useMemo(() => {
    return [...annotations].sort((a, b) => {
      // 获取页面索引
      const pageA =
        a.type === "area"
          ? (a.areaData?.pageIndex ?? 0)
          : (a.annotation?.pageIndex ?? 0);
      const pageB =
        b.type === "area"
          ? (b.areaData?.pageIndex ?? 0)
          : (b.annotation?.pageIndex ?? 0);

      if (pageA !== pageB) return pageA - pageB;

      // 同一页面按 Y 坐标排序
      const yA =
        a.type === "area"
          ? (a.areaData?.rect.y ?? 0)
          : (a.annotation?.rect?.origin?.y ?? 0);
      const yB =
        b.type === "area"
          ? (b.areaData?.rect.y ?? 0)
          : (b.annotation?.rect?.origin?.y ?? 0);

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
    const hasNote =
      annotation.notes?.[0]?.note && annotation.notes[0].note.length > 0;
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
      <div className="pdf-embed-sidebar-placeholder">
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无标注" />
      </div>
    );
  }

  return (
    <div className="pdf-sidebar-notes">
      {sortedAnnotations.map((annotation) => {
        const note = annotation.notes?.[0];
        const hasNote = note?.note && note.note.length > 0;
        const isAreaAnnotation = annotation.type === "area";
        const quote = isAreaAnnotation
          ? null
          : formatAnnotationSnippet(annotation.annotation);
        const pageIndex = isAreaAnnotation
          ? (annotation.areaData?.pageIndex ?? 0)
          : (annotation.annotation?.pageIndex ?? 0);

        return (
          <div
            key={annotation.id}
            className="pdf-note-card"
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
                className="pdf-note-card-more"
                onClick={(e) => e.stopPropagation()}
              >
                <MoreHorizontalIcon size={16} />
              </button>
            </Dropdown>

            {/* 引用区域 - 区域标注显示截图，文本标注显示文字 */}
            <div className="pdf-note-quote">
              {isAreaAnnotation && annotation.areaData?.captureUrl ? (
                <img
                  src={annotation.areaData.captureUrl}
                  alt="区域截图"
                  className="pdf-note-quote-image"
                />
              ) : (
                <span className="pdf-note-quote-text">{quote}</span>
              )}
              <div className="pdf-note-quote-page">第 {pageIndex + 1} 页</div>
            </div>

            {/* 用户笔记区域 */}
            <div className="pdf-note-user">
              {hasNote ? (
                <Editor
                  className="pdf-note-user-content"
                  initValue={note.note.slice(0, 2)}
                  readonly
                />
              ) : (
                <span className="pdf-note-user-empty">
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
  onCollapsedChange,
}: PdfEmbedSidebarProps) => {
  const bookmarksCount = bookmarks.length;
  const notesCount = useMemo(() => annotations.length, [annotations]);

  const renderContent = () => {
    switch (activeTab) {
      case "outline":
        return (
          <OutlineTab outline={outline} onOutlineSelect={onOutlineSelect} />
        );
      case "bookmarks":
        return (
          <BookmarksTab
            bookmarks={bookmarks}
            onSelect={onBookmarkSelect}
            onDelete={onBookmarkDelete}
          />
        );
      case "notes":
        return (
          <NotesTab
            annotations={annotations}
            onDeleteAnnotation={onAnnotationDelete}
            onAnnotationClick={onAnnotationClick}
            onAnnotationEdit={onAnnotationEdit}
          />
        );
      case "thumbnails":
        return (
          <div className="pdf-sidebar-thumbnails">
            <PdfEmbedThumbnails />
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="pdf-embed-sidebar">
      <div className="pdf-sidebar-header">
        <div className="pdf-sidebar-tabs">
          {SIDEBAR_TABS.map((tab) => {
            const Icon = tab.icon;
            const count =
              tab.key === "bookmarks"
                ? bookmarksCount
                : tab.key === "notes"
                  ? notesCount
                  : 0;
            return (
              <button
                key={tab.key}
                type="button"
                className={classNames("pdf-sidebar-tab", {
                  active: activeTab === tab.key,
                })}
                onClick={() => onTabChange(tab.key)}
              >
                <span className="pdf-sidebar-tab-icon">
                  <Icon size={16} />
                  {count > 0 && (
                    <span className="pdf-sidebar-tab-badge">{count}</span>
                  )}
                </span>
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
        <button
          type="button"
          className="pdf-sidebar-collapse-btn"
          onClick={() => onCollapsedChange?.(true)}
          title="收起侧边栏"
        >
          <PanelLeftCloseIcon size={18} />
        </button>
      </div>
      <div className="pdf-sidebar-content">{renderContent()}</div>
    </div>
  );
};

export default PdfEmbedSidebar;
