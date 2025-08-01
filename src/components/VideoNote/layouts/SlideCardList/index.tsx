import React, { memo } from "react";
import { Button, Tooltip, App } from "antd";
import { DeleteOutlined, MergeCellsOutlined } from "@ant-design/icons";
import classnames from "classnames";
import { VideoNote as VideoNoteType } from "@/types";
import styles from "./index.module.less";
import { useTheme } from "../../ThemeContext";
import { EditorSection } from "../useVideoNoteBase";
import DraggableSlideCard from "../DraggableSlideCard";

interface SlideCardListProps {
  notes: VideoNoteType["notes"];
  editorSections: EditorSection[];
  formatTime: (time: number) => string;
  handleNoteClick: (noteId: string) => void;
  handleDeleteNote: (noteId: string) => void;
  handleAddNote: () => void;
  isSelectionMode: boolean;
  toggleSelectionMode: () => void;
  selectedNoteIds: string[];
  toggleSelectNote: (noteId: string) => void;
  handleBatchDelete: () => void;
  handleBatchMerge: () => void;
  canMergeSelected: boolean;
  gridContainerRef: React.RefObject<HTMLDivElement>;
  handleMoveNote: (dragId: string, hoverId: string) => void;
}

const SlideCardList: React.FC<SlideCardListProps> = memo(
  ({
    notes,
    editorSections,
    formatTime,
    handleNoteClick,
    handleDeleteNote,
    handleAddNote,
    isSelectionMode,
    toggleSelectionMode,
    selectedNoteIds,
    toggleSelectNote,
    handleBatchDelete,
    handleBatchMerge,
    canMergeSelected,
    gridContainerRef,
    handleMoveNote,
  }) => {
    const theme = useTheme();
    const { modal } = App.useApp();

    const handleBatchDeleteWithConfirm = () => {
      if (selectedNoteIds.length === 0) return;

      modal.confirm({
        title: "批量删除笔记",
        content: `确定要删除选中的 ${selectedNoteIds.length} 条笔记吗？`,
        okText: "确认",
        okButtonProps: {
          danger: true,
        },
        cancelText: "取消",
        onOk: handleBatchDelete,
      });
    };

    return (
      <div
        className={classnames(styles.slidesSection, {
          [styles.dark]: theme === "dark",
          [styles.selectionMode]: isSelectionMode,
        })}
      >
        <div className={styles.slidesHeader}>
          <h3>视频标注</h3>
          <div className={styles.headerActions}>
            {isSelectionMode ? (
              <div className={styles.batchActions}>
                <Tooltip title="取消选择">
                  <Button
                    type="text"
                    onClick={toggleSelectionMode}
                    className={styles.cancelSelectButton}
                  >
                    取消
                  </Button>
                </Tooltip>
                <Tooltip title="批量删除">
                  <Button
                    type="text"
                    danger
                    icon={<DeleteOutlined />}
                    disabled={selectedNoteIds.length === 0}
                    onClick={handleBatchDeleteWithConfirm}
                  >
                    删除
                  </Button>
                </Tooltip>
                <Tooltip
                  title={
                    canMergeSelected
                      ? "合并选中的连续卡片"
                      : "只能合并连续的卡片"
                  }
                >
                  <Button
                    type="text"
                    icon={<MergeCellsOutlined />}
                    disabled={!canMergeSelected}
                    onClick={handleBatchMerge}
                  >
                    合并
                  </Button>
                </Tooltip>
              </div>
            ) : (
              <>
                <Button
                  type="text"
                  onClick={toggleSelectionMode}
                  className={styles.manageButton}
                >
                  管理
                </Button>
                <Button
                  type="primary"
                  onClick={handleAddNote}
                  className={styles.addNoteButton}
                >
                  添加标注
                </Button>
              </>
            )}
          </div>
        </div>
        <div className={styles.slidesContainer} ref={gridContainerRef}>
          {notes.map((note) => (
            <DraggableSlideCard
              key={note.id}
              note={note}
              isActive={editorSections.some(
                (section) => section.noteId === note.id,
              )}
              formatTime={formatTime}
              onClick={handleNoteClick}
              onDelete={handleDeleteNote}
              isSelectionMode={isSelectionMode}
              isSelected={selectedNoteIds.includes(note.id)}
              onSelect={toggleSelectNote}
              moveCard={handleMoveNote}
            />
          ))}
          {!isSelectionMode && (
            <div className={styles.addCardButton} onClick={handleAddNote}>
              <div className={styles.addIcon}>+</div>
              <span>添加新标注</span>
            </div>
          )}
        </div>
      </div>
    );
  },
);

export default SlideCardList;
