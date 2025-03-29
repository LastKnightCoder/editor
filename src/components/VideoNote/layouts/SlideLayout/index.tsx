import React, { memo, useRef, useEffect, useState } from "react";
import LocalVideo from "@/components/LocalVideo";
import Editor, { EditorRef } from "@/components/Editor";
import classnames from "classnames";
import { VideoNoteBaseProps, useVideoNoteBase } from "../VideoNoteBase";
import SlideCard from "../SlideCard";
import styles from "./index.module.less";
import { useMemoizedFn } from "ahooks";
import { useTheme } from "../../ThemeContext";
import { useDrop } from "react-dnd";
import { ItemTypes } from "../../constants";
import { ResizableBox, ResizeCallbackData } from "react-resizable";
import "react-resizable/css/styles.css";
import useGridLayout from "@/hooks/useGridLayout";

interface EditorSection {
  id: string;
  noteId: string;
  height: number;
}

const SlideLayout: React.FC<VideoNoteBaseProps> = memo(
  ({ videoSrc, initialNotes, onNotesChange, uploadResource }) => {
    const theme = useTheme();
    const {
      videoRef,
      notes,
      activeNoteId,
      extensions,
      handleAddNote: baseHandleAddNote,
      handleNoteChange,
      handleNoteClick,
      handleDeleteNote,
      setActiveNoteId,
      formatTime,
    } = useVideoNoteBase({
      videoSrc,
      initialNotes,
      onNotesChange,
      uploadResource,
    });

    const { gridContainerRef, itemWidth, gap } = useGridLayout({
      minWidth: 180,
      maxWidth: 240,
    });

    const editorRef = useRef<EditorRef>(null);
    const [editorSections, setEditorSections] = useState<EditorSection[]>([]);

    const handleActiveNoteChange = useMemoizedFn((noteId: string | null) => {
      if (editorRef.current && noteId) {
        const activeNote = notes.find((n) => n.id === noteId);
        if (activeNote) {
          editorRef.current.setEditorValue(activeNote.content);
        }
      }

      if (
        activeNoteId &&
        !editorSections.some((section) => section.noteId === activeNoteId)
      ) {
        setEditorSections((prev) => [
          ...prev,
          {
            id: `section-${Date.now()}`,
            noteId: activeNoteId,
            height: 300,
          },
        ]);
      }
    });

    const handleExitEdit = useMemoizedFn(() => {
      setActiveNoteId(null);
      setEditorSections([]);
    });

    // 自定义添加标注处理函数
    const handleAddNote = useMemoizedFn(() => {
      // 先调用原来的添加标注函数创建新的标注
      baseHandleAddNote();

      // 如果当前只有一个正在编辑的标注，清除之前的标注
      if (editorSections.length === 1) {
        setEditorSections([]);
        // 新的标注会通过useEffect添加
      }
      // 如果有多个或没有编辑的标注，保持原来的逻辑，useEffect会添加新标注
    });

    useEffect(() => {
      handleActiveNoteChange(activeNoteId);
    }, [activeNoteId, handleActiveNoteChange]);

    // 处理删除笔记时的编辑区域更新
    useEffect(() => {
      const noteIds = notes.map((note) => note.id);
      setEditorSections((prev) =>
        prev.filter((section) => noteIds.includes(section.noteId)),
      );
    }, [notes]);

    const [{ isOver }, drop] = useDrop(() => ({
      accept: ItemTypes.SLIDE_CARD,
      drop: (item: { id: string }) => {
        const noteId = item.id;
        if (!editorSections.some((section) => section.noteId === noteId)) {
          setEditorSections((prev) => [
            ...prev,
            {
              id: `section-${Date.now()}`,
              noteId,
              height: 300,
            },
          ]);
        }
        setActiveNoteId(noteId);
      },
      collect: (monitor) => ({
        isOver: monitor.isOver(),
      }),
    }));

    const handleRemoveSection = (sectionId: string) => {
      setEditorSections((prev) =>
        prev.filter((section) => section.id !== sectionId),
      );

      // 如果删除的是当前选中的区域，更新activeNoteId
      if (editorSections.length > 0) {
        const remainingSections = editorSections.filter(
          (section) => section.id !== sectionId,
        );
        if (remainingSections.length > 0) {
          setActiveNoteId(remainingSections[0].noteId);
        } else {
          setActiveNoteId(null);
        }
      }
    };

    const handleResizeSection = (sectionId: string, height: number) => {
      setEditorSections((prev) =>
        prev.map((section) =>
          section.id === sectionId ? { ...section, height } : section,
        ),
      );
    };

    return (
      <div
        className={classnames(styles.container, {
          [styles.dark]: theme === "dark",
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

          <div className={classnames(styles.slidesSection)}>
            <div className={styles.slidesHeader}>
              <h3>视频标注</h3>
              <button className={styles.addNoteButton} onClick={handleAddNote}>
                添加标注
              </button>
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
                  isActive={
                    note.id === activeNoteId ||
                    editorSections.some((section) => section.noteId === note.id)
                  }
                  formatTime={formatTime}
                  onClick={handleNoteClick}
                  onDelete={handleDeleteNote}
                  style={{ width: itemWidth }}
                />
              ))}
              <div
                className={styles.addCardButton}
                onClick={handleAddNote}
                style={{ width: itemWidth }}
              >
                <div className={styles.addIcon}>+</div>
                <span>添加新标注</span>
              </div>
            </div>
          </div>
        </div>

        <div
          ref={drop}
          className={classnames(styles.editorsContainer, {
            [styles.dropTarget]: isOver,
            [styles.empty]: editorSections.length === 0,
          })}
        >
          {editorSections.length > 0 ? (
            editorSections.map((section) => {
              const note = notes.find((n) => n.id === section.noteId);
              if (!note) return null;

              return (
                <ResizableBox
                  key={section.id}
                  width={Infinity}
                  height={section.height}
                  axis="y"
                  minConstraints={[Infinity, 200]}
                  maxConstraints={[Infinity, 1000]}
                  resizeHandles={["s"]}
                  onResize={(
                    _e: React.SyntheticEvent,
                    data: ResizeCallbackData,
                  ) => {
                    handleResizeSection(section.id, data.size.height);
                  }}
                  className={styles.resizableSection}
                >
                  <div
                    className={classnames(styles.editorSection, {
                      [styles.activeEditor]: section.noteId === activeNoteId,
                    })}
                  >
                    <div className={styles.editorHeader}>
                      <h4>{formatTime(note.startTime)} 的笔记</h4>
                      <div className={styles.editorActions}>
                        <button
                          className={styles.editorCloseButton}
                          onClick={() => handleRemoveSection(section.id)}
                          title="关闭"
                        >
                          ×
                        </button>
                      </div>
                    </div>
                    <div className={styles.editorContent}>
                      <Editor
                        key={`${section.id}-${section.noteId}`}
                        ref={
                          section.noteId === activeNoteId
                            ? editorRef
                            : undefined
                        }
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
            })
          ) : (
            <div className={styles.emptyEditor}>
              <button className={styles.addNoteButton} onClick={handleAddNote}>
                添加标注
              </button>
              <p>选择标注或添加新标注来开始编辑</p>
              <p className={styles.dropHint}>或将左侧笔记卡片拖放到此处</p>
            </div>
          )}
          {editorSections.length > 0 && (
            <button
              className={styles.exitEditButton}
              onClick={handleExitEdit}
              title="退出编辑"
            >
              退出编辑
            </button>
          )}
        </div>
      </div>
    );
  },
);

export default SlideLayout;
