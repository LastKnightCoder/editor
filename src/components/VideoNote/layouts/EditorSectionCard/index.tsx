import React, { useRef } from "react";
import classnames from "classnames";
import { useDrag, useDrop } from "react-dnd";
import { MdDragIndicator } from "react-icons/md";
import { VideoNote } from "@/types";
import { ResizableBox, ResizeCallbackData } from "react-resizable";
import "react-resizable/css/styles.css";
import Editor from "@/components/Editor";
import { EditorSection } from "../useVideoNoteBase";
import { ItemTypes } from "../../constants";
import styles from "./index.module.less";

// 拖拽项类型定义
interface EditorSectionDragItem {
  index: number;
  id: string;
  type: string;
}

interface EditorSectionCardProps {
  section: EditorSection;
  index: number;
  notes: VideoNote["notes"];
  formatTime: (time: number) => string;
  handleExitEditByNoteId: (noteId: string) => void;
  handleNoteChange: (noteId: string, value: any) => void;
  handleResizeSection: (noteId: string, height: number) => void;
  handleMoveEditorSection: (dragIndex: number, hoverIndex: number) => void;
  extensions: any[];
  uploadResource?: (file: File) => Promise<string | null>;
}

const EditorSectionCard: React.FC<EditorSectionCardProps> = ({
  section,
  index,
  notes,
  formatTime,
  handleExitEditByNoteId,
  handleNoteChange,
  handleResizeSection,
  handleMoveEditorSection,
  extensions,
  uploadResource,
}) => {
  // 使用 ref 引用 DOM 元素
  const ref = useRef<HTMLDivElement>(null);

  // 拖拽处理
  const [{ isDragging }, drag] = useDrag({
    type: ItemTypes.EDITOR_SECTION,
    item: { index, id: section.noteId, type: ItemTypes.EDITOR_SECTION },
    collect: (monitor) => ({
      isDragging: !!monitor.isDragging(),
    }),
  });

  // 放置处理
  const [{ handlerId }, drop] = useDrop<
    EditorSectionDragItem,
    void,
    { handlerId: string | symbol | null }
  >({
    accept: ItemTypes.EDITOR_SECTION,
    collect: (monitor) => ({
      handlerId: monitor.getHandlerId(),
    }),
    hover: (item: EditorSectionDragItem, monitor) => {
      if (!ref.current) {
        return;
      }
      const dragIndex = item.index;
      const hoverIndex = index;

      // 不要替换自己
      if (dragIndex === hoverIndex) {
        return;
      }

      // 确定矩形边界
      const hoverBoundingRect = ref.current?.getBoundingClientRect();

      // 获取垂直中点
      const hoverMiddleY =
        (hoverBoundingRect.bottom - hoverBoundingRect.top) / 2;

      // 确定鼠标位置
      const clientOffset = monitor.getClientOffset();

      // 获取距顶部距离
      const hoverClientY = clientOffset!.y - hoverBoundingRect.top;

      // 仅在越过一半高度时执行移动
      // 向下拖动
      if (dragIndex < hoverIndex && hoverClientY < hoverMiddleY) {
        return;
      }

      // 向上拖动
      if (dragIndex > hoverIndex && hoverClientY > hoverMiddleY) {
        return;
      }

      // 执行移动
      handleMoveEditorSection(dragIndex, hoverIndex);

      // 修改被拖拽项的 index 为新的位置
      item.index = hoverIndex;
    },
  });

  const note = notes.find((n) => n.id === section.noteId);
  if (!note) return null;

  // 合并引用
  drag(drop(ref));

  const opacity = isDragging ? 0.4 : 1;

  return (
    <ResizableBox
      key={section.noteId}
      width={Infinity}
      height={section.height}
      axis="y"
      minConstraints={[Infinity, 200]}
      maxConstraints={[Infinity, 1000]}
      resizeHandles={["s"]}
      onResize={(_e: React.SyntheticEvent, data: ResizeCallbackData) => {
        handleResizeSection(section.noteId, data.size.height);
      }}
      className={styles.resizableSection}
    >
      <div
        ref={ref}
        className={classnames(styles.editorSection, {
          [styles.dragging]: isDragging,
        })}
        style={{ opacity }}
        data-handler-id={handlerId}
      >
        <div className={styles.editorHeader}>
          <div className={styles.dragHandle}>
            <MdDragIndicator />
          </div>
          <h4>{formatTime(note.startTime)} 的笔记</h4>
          <div className={styles.editorActions}>
            <button
              className={styles.editorCloseButton}
              onClick={() => handleExitEditByNoteId(section.noteId)}
              title="关闭"
            >
              ×
            </button>
          </div>
        </div>
        <div className={styles.editorContent}>
          <Editor
            key={section.noteId}
            initValue={note.content}
            onChange={(value) => handleNoteChange(note.id, value)}
            readonly={false}
            uploadResource={uploadResource}
            extensions={extensions}
          />
        </div>
      </div>
    </ResizableBox>
  );
};

export default EditorSectionCard;
