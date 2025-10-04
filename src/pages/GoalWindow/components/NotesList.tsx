import { useState, useRef, memo } from "react";
import { App } from "antd";
import RichTextEditModal from "@/components/RichTextEditModal";
import { useMemoizedFn } from "ahooks";
import { motion, AnimatePresence } from "framer-motion";
import {
  MdClose,
  MdNote,
  MdArticle,
  MdFolder,
  MdDescription,
} from "react-icons/md";
import classNames from "classnames";
import useTheme from "@/hooks/useTheme";

export interface NoteItem {
  id: number;
  contentId: number;
  title?: string;
  type?: string;
  createTime?: number;
}

interface NotesListProps {
  notes: NoteItem[];
  readonly?: boolean;
  showCreateTime?: boolean;
  emptyText?: string;
  className?: string;
  onDelete?: (noteId: number) => Promise<void>;
  onUpdateTitle?: (noteId: number, title: string) => Promise<void>;
  onUpdateType?: (noteId: number, type: string) => Promise<void>;
  onRefresh?: () => Promise<void>;
}

const getTypeIcon = (type?: string) => {
  const iconProps = "w-4 h-4";
  switch (type) {
    case "card":
      return <MdNote className={`${iconProps} text-blue-500`} />;
    case "article":
      return <MdArticle className={`${iconProps} text-green-500`} />;
    case "project-item":
      return <MdFolder className={`${iconProps} text-orange-500`} />;
    case "document-item":
    case "document":
      return <MdDescription className={`${iconProps} text-purple-500`} />;
    case "custom":
    default:
      return <MdDescription className={`${iconProps} text-gray-500`} />;
  }
};

const NotesList: React.FC<NotesListProps> = memo(
  ({
    notes,
    readonly = false,
    showCreateTime = false,
    emptyText,
    className,
    onDelete,
    onUpdateTitle,
    onUpdateType,
    onRefresh,
  }) => {
    const { message, modal } = App.useApp();
    const { isDark } = useTheme();
    const scrollContainerRef = useRef<HTMLDivElement>(null);

    const [editModalVisible, setEditModalVisible] = useState(false);
    const [currentEditingContentId, setCurrentEditingContentId] = useState<
      number | null
    >(null);
    const [currentEditingNoteId, setCurrentEditingNoteId] = useState<
      number | null
    >(null);
    const [currentEditingTitle, setCurrentEditingTitle] = useState("");
    const [hoveredNoteId, setHoveredNoteId] = useState<string | null>(null);

    const handleWheel = useMemoizedFn((e: React.WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        if (scrollContainerRef.current) {
          scrollContainerRef.current.scrollLeft += e.deltaY;
        }
      }
    });

    const handleEditNote = useMemoizedFn((note: NoteItem) => {
      setCurrentEditingNoteId(note.id);
      setCurrentEditingContentId(note.contentId);
      setCurrentEditingTitle(note.title || "未命名文档");
      setEditModalVisible(true);
    });

    const handleDeleteNote = useMemoizedFn(
      async (noteId: number, e: React.MouseEvent) => {
        e.stopPropagation();

        if (!onDelete) return;

        modal.confirm({
          title: "删除笔记",
          content: "确定要删除这个笔记吗？",
          okButtonProps: {
            danger: true,
          },
          onOk: async () => {
            try {
              await onDelete(noteId);
              message.success("笔记删除成功");
            } catch (error) {
              console.error("删除笔记失败:", error);
              message.error("删除笔记失败");
            }
          },
        });
      },
    );

    const handleEditSave = useMemoizedFn(async (title: string) => {
      if (!currentEditingNoteId || !onUpdateTitle) return;

      try {
        const note = notes.find((n) => n.id === currentEditingNoteId);
        if (note) {
          await onUpdateTitle(note.id, title || note.title || "");
        }
      } catch (error) {
        console.error("更新笔记标题失败:", error);
        message.error("更新笔记标题失败");
      }
    });

    const handleTypeChange = useMemoizedFn(async (type: string) => {
      if (!currentEditingNoteId || !onUpdateType) return;

      try {
        const note = notes.find((n) => n.id === currentEditingNoteId);
        if (note) {
          await onUpdateType(note.id, type);
        }
      } catch (error) {
        console.error("更新笔记类型失败:", error);
        message.error("更新笔记类型失败");
      }
    });

    const onCloseEdit = useMemoizedFn(async () => {
      setEditModalVisible(false);
      setCurrentEditingContentId(null);
      setCurrentEditingNoteId(null);
      setCurrentEditingTitle("");
      // 关闭编辑时刷新数据
      if (onRefresh) {
        await onRefresh();
      }
    });

    if (notes.length === 0) {
      if (emptyText) {
        return (
          <div
            className={classNames(
              "flex flex-col gap-2 p-4 text-center text-gray-500",
              className,
            )}
          >
            {emptyText}
          </div>
        );
      }
      return null;
    }

    return (
      <div className={classNames("flex flex-col gap-2", className)}>
        <div
          ref={scrollContainerRef}
          className="overflow-x-auto overflow-y-hidden scrollbar-hide"
          onWheel={handleWheel}
          style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
        >
          <div className="flex py-1 min-w-max">
            {notes.map((note) => (
              <motion.div
                key={note.id}
                className={classNames(
                  "relative group flex items-center gap-2 px-3 py-2 mx-2 rounded-lg border transition-all cursor-pointer min-w-0 flex-none",
                  {
                    "border-gray-200 bg-white hover:border-blue-400 hover:bg-blue-50":
                      !isDark,
                    "border-gray-600 bg-gray-800 hover:border-gray-500 hover:bg-gray-700":
                      isDark,
                  },
                )}
                onClick={() => handleEditNote(note)}
                onMouseEnter={() => setHoveredNoteId(note.id.toString())}
                onMouseLeave={() => setHoveredNoteId(null)}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                <div className="flex-shrink-0">
                  {getTypeIcon(note.type || "custom")}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">
                    {note.title || "未命名文档"}
                  </div>
                </div>
                {showCreateTime && note.createTime && (
                  <div className="text-xs opacity-50 flex-shrink-0">
                    {new Date(note.createTime).toLocaleDateString()}
                  </div>
                )}
                <AnimatePresence>
                  {!readonly && hoveredNoteId === note.id.toString() && (
                    <motion.div
                      initial={{ scale: 0, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 0, opacity: 0 }}
                      whileHover={{ scale: 1.1 }}
                      whileTap={{ scale: 0.9 }}
                      className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center cursor-pointer shadow-lg z-10"
                      onClick={(e) => handleDeleteNote(note.id, e)}
                    >
                      <MdClose className="w-3 h-3 text-white" />
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            ))}
          </div>
        </div>
        {currentEditingContentId && (
          <RichTextEditModal
            visible={editModalVisible}
            contentId={currentEditingContentId}
            title={currentEditingTitle}
            onClose={onCloseEdit}
            onTitleChange={handleEditSave}
            onTypeChange={handleTypeChange}
          />
        )}
      </div>
    );
  },
);

NotesList.displayName = "NotesList";

export default NotesList;
