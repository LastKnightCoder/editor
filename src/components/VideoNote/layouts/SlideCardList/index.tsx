import React, { memo } from "react";
import { Button, Tooltip } from "antd";
import { DeleteOutlined, MergeCellsOutlined } from "@ant-design/icons";
import classnames from "classnames";
import { VideoNote as VideoNoteType } from "@/types";
import SlideCard from "../SlideCard";
import styles from "./index.module.less";
import { useTheme } from "../../ThemeContext";
import { EditorSection } from "../useVideoNoteBase";

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
  itemWidth: number;
  gap: number;
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
    itemWidth,
    gap,
  }) => {
    const theme = useTheme();

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
                    onClick={handleBatchDelete}
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
        <div
          className={styles.slidesContainer}
          ref={gridContainerRef}
          style={{ gap }}
        >
          {notes.map((note) => (
            <SlideCard
              key={note.id}
              note={note}
              isActive={editorSections.some(
                (section) => section.noteId === note.id,
              )}
              formatTime={formatTime}
              onClick={handleNoteClick}
              onDelete={handleDeleteNote}
              style={{ width: itemWidth }}
              isSelectionMode={isSelectionMode}
              isSelected={selectedNoteIds.includes(note.id)}
              onSelect={toggleSelectNote}
            />
          ))}
          {!isSelectionMode && (
            <div
              className={styles.addCardButton}
              onClick={handleAddNote}
              style={{ width: itemWidth }}
            >
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
