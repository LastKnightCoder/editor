import React, { memo, useRef } from "react";
import { Button } from "antd";
import LocalVideo from "@/components/LocalVideo";
import classnames from "classnames";
import { useDrop } from "react-dnd";
import "react-resizable/css/styles.css";

import styles from "./index.module.less";

import { VideoNoteBaseProps, useVideoNoteBase } from "../useVideoNoteBase";
import { ItemTypes } from "../../constants";
import { useTheme } from "../../ThemeContext";
import EditorSectionCard from "../EditorSectionCard";
import SlideCardList from "../SlideCardList";

const SlideLayout: React.FC<VideoNoteBaseProps> = memo(
  ({
    videoSrc,
    initialNotes,
    updateNotes,
    uploadResource,
    addSubNote,
    deleteSubNote,
  }) => {
    const theme = useTheme();
    const gridContainerRef = useRef<HTMLDivElement>(null);
    const {
      videoRef,
      notes,
      extensions,
      handleAddNote,
      syncNotesByContentId,
      handleNoteClick,
      handleDeleteNote,
      formatTime,
      editorSections,
      handleExitEdit,
      handleResizeSection,
      handleExitEditByNoteId,
      handleSlideCardDrop,
      handleMoveEditorSection,
      handleMoveNote,
      isSelectionMode,
      toggleSelectionMode,
      selectedNoteIds,
      toggleSelectNote,
      handleBatchDelete,
      handleBatchMerge,
      canMergeSelected,
    } = useVideoNoteBase({
      videoSrc,
      initialNotes,
      uploadResource,
      addSubNote,
      deleteSubNote,
      updateNotes,
    });

    const [{ isOver, canDrop }, drop] = useDrop(
      () => ({
        accept: ItemTypes.SLIDE_CARD,
        drop: (item: { id: string }) => {
          const noteId = item.id;
          if (!editorSections.some((section) => section.noteId === noteId)) {
            handleSlideCardDrop(noteId);
          }
        },
        canDrop: (item: { id: string }) =>
          !editorSections.some((section) => section.noteId === item.id),
        collect: (monitor) => ({
          isOver: monitor.isOver(),
          canDrop: monitor.canDrop(),
        }),
      }),
      [handleSlideCardDrop, editorSections],
    );

    return (
      <div
        className={classnames(styles.container, {
          [styles.dark]: theme === "dark",
          [styles.selectionMode]: isSelectionMode,
        })}
      >
        <div className={classnames(styles.leftSection)}>
          <div className={classnames(styles.videoSection)}>
            <LocalVideo
              className={styles.video}
              ref={videoRef}
              src={videoSrc}
              controls
            />
          </div>

          <SlideCardList
            notes={notes}
            editorSections={editorSections}
            formatTime={formatTime}
            handleNoteClick={handleNoteClick}
            handleDeleteNote={handleDeleteNote}
            handleAddNote={handleAddNote}
            isSelectionMode={isSelectionMode}
            toggleSelectionMode={toggleSelectionMode}
            selectedNoteIds={selectedNoteIds}
            toggleSelectNote={toggleSelectNote}
            handleBatchDelete={handleBatchDelete}
            handleBatchMerge={handleBatchMerge}
            canMergeSelected={canMergeSelected}
            gridContainerRef={gridContainerRef}
            handleMoveNote={handleMoveNote}
          />
        </div>

        <div
          ref={drop}
          className={classnames(styles.editorsContainer, {
            [styles.dropTarget]: isOver && canDrop,
            [styles.dropInvalid]: isOver && !canDrop,
            [styles.empty]: editorSections.length === 0,
          })}
        >
          {editorSections.length > 0 ? (
            editorSections.map((section, index) => (
              <EditorSectionCard
                key={section.noteId}
                section={section}
                index={index}
                notes={notes}
                formatTime={formatTime}
                handleExitEditByNoteId={handleExitEditByNoteId}
                syncNotesByContentId={syncNotesByContentId}
                handleResizeSection={handleResizeSection}
                handleMoveEditorSection={handleMoveEditorSection}
                extensions={extensions}
                uploadResource={uploadResource}
              />
            ))
          ) : (
            <div className={styles.emptyEditor}>
              <Button type="primary" onClick={handleAddNote}>
                添加标注
              </Button>
              <p>选择标注或添加新标注来开始编辑</p>
              <p className={styles.dropHint}>或将左侧笔记卡片拖放到此处</p>
            </div>
          )}
          {editorSections.length > 0 && (
            <Button
              type="default"
              onClick={handleExitEdit}
              className={styles.exitEditButton}
            >
              退出编辑
            </Button>
          )}
        </div>
      </div>
    );
  },
);

export default SlideLayout;
