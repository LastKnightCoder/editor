import { useMemo, useState, useEffect } from "react";
import classNames from "classnames";
import { Empty, Tree, Button, Modal } from "antd";
import type { DataNode } from "antd/es/tree";
import type { PdfBookmarkObject } from "@embedpdf/models";
import type { Descendant } from "slate";
import { v4 as uuidv4 } from "uuid";
import type { LucideIcon } from "lucide-react";
import {
  ListTreeIcon,
  BookmarkIcon,
  StickyNoteIcon,
  ImagesIcon,
} from "lucide-react";
import Editor from "@/components/Editor";
import { formatAnnotationSnippet } from "../utils/annotation";
import { getEditorText } from "@/utils/editor";
import type { PdfAnnotation, PdfBookmark, Note } from "@/types";
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
  onAnnotationNoteChange?: (id: number, notes: Note[]) => void;
  onAnnotationDelete?: (annotation: PdfAnnotation) => void;
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

const createEmptyNoteValue = (): Descendant[] => [
  {
    type: "paragraph",
    children: [{ type: "formatted", text: "" }],
  },
];

const NotesTab = ({
  annotations,
  onEdit,
  onDeleteAnnotation,
}: {
  annotations: PdfAnnotation[];
  onEdit?: (id: number, notes: Note[]) => void;
  onDeleteAnnotation?: (annotation: PdfAnnotation) => void;
}) => {
  const [editing, setEditing] = useState<PdfAnnotation | null>(null);
  const [editorValue, setEditorValue] = useState<Descendant[]>(
    createEmptyNoteValue(),
  );

  useEffect(() => {
    if (editing) {
      const existing = editing.notes?.[0]?.note;
      setEditorValue(
        existing && existing.length ? existing : createEmptyNoteValue(),
      );
    } else {
      setEditorValue(createEmptyNoteValue());
    }
  }, [editing]);

  const handleSave = () => {
    if (!editing) return;
    const baseNote = editing.notes?.[0];
    const nextNote: Note = baseNote
      ? { ...baseNote, note: editorValue }
      : { id: uuidv4(), note: editorValue };
    onEdit?.(editing.id, [nextNote]);
    setEditing(null);
  };

  return (
    <div className="pdf-embed-notes">
      {annotations.map((annotation) => {
        const note = annotation.notes?.[0];
        const snippet = note?.note
          ? getEditorText(note.note, 40)
          : formatAnnotationSnippet(annotation.annotation);
        return (
          <div key={annotation.id} className="pdf-embed-note-row">
            <div className="pdf-embed-note-main">
              <div className="pdf-embed-note-title">
                {formatAnnotationSnippet(annotation.annotation)}
              </div>
              <div className="pdf-embed-note-snippet">{snippet}</div>
            </div>
            <div className="pdf-embed-note-actions">
              <Button
                size="small"
                type="link"
                onClick={() => setEditing(annotation)}
              >
                {note ? "编辑" : "添加"}
              </Button>
              <Button
                size="small"
                type="link"
                danger
                onClick={() => onDeleteAnnotation?.(annotation)}
              >
                删除
              </Button>
            </div>
          </div>
        );
      })}
      <Modal
        open={Boolean(editing)}
        title="编辑笔记"
        onOk={handleSave}
        onCancel={() => setEditing(null)}
        destroyOnClose
        width={640}
      >
        <Editor
          key={editing?.id || "note-editor"}
          initValue={editorValue}
          onChange={setEditorValue}
          readonly={false}
        />
      </Modal>
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
  onAnnotationNoteChange,
  onAnnotationDelete,
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
            onEdit={onAnnotationNoteChange}
            onDeleteAnnotation={onAnnotationDelete}
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
              <Icon size={16} />
              <span>{tab.label}</span>
              {count ? (
                <span className="pdf-sidebar-tab-count">{count}</span>
              ) : null}
            </button>
          );
        })}
      </div>
      <div className="pdf-sidebar-content">{renderContent()}</div>
    </div>
  );
};

export default PdfEmbedSidebar;
