import React, { useRef, useMemo, useState } from "react";
import { Descendant } from "slate";
import { v4 as uuidv4 } from "uuid";
import { VideoControllerImpl } from "../VideoController";
import { createVideoNoteExtensions } from "../extensions";
import { getContentLength } from "@/utils/helper";
import { VideoNote as VideoNoteType } from "@/types";
import { produce } from "immer";
import { useMemoizedFn } from "ahooks";
import IExtension from "@/components/Editor/extensions/types";

export interface VideoNoteBaseProps {
  videoSrc: string;
  initialNotes?: VideoNoteType["notes"];
  onNotesChange?: (value: VideoNoteType["notes"]) => void;
  uploadResource?: (file: File) => Promise<string | null>;
}

export interface VideoNoteBaseReturnProps {
  videoRef: React.RefObject<HTMLVideoElement>;
  notes: VideoNoteType["notes"];
  extensions: IExtension[];
  handleAddNote: () => void;
  handleNoteChange: (noteId: string, content: Descendant[]) => void;
  handleNoteClick: (noteId: string) => void;
  handleDeleteNote: (noteId: string) => void;
  formatTime: (time: number) => string;
  editorSections: EditorSection[];
  handleExitEditByNoteId: (noteId: string) => void;
  handleExitEdit: () => void;
  handleResizeSection: (noteId: string, height: number) => void;
  handleSlideCardDrop: (noteId: string) => void;
  handleMoveEditorSection: (dragIndex: number, hoverIndex: number) => void;
  isSelectionMode: boolean;
  toggleSelectionMode: () => void;
  selectedNoteIds: string[];
  toggleSelectNote: (noteId: string) => void;
  handleBatchDelete: () => void;
  handleBatchMerge: () => void;
  canMergeSelected: boolean;
}

export interface EditorSection {
  noteId: string;
  height: number;
}

export const useVideoNoteBase = ({
  initialNotes = [],
  onNotesChange,
  uploadResource,
}: VideoNoteBaseProps): VideoNoteBaseReturnProps => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [notes, setNotes] = useState<VideoNoteType["notes"]>(initialNotes);
  const [editorSections, setEditorSections] = useState<EditorSection[]>([]);
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedNoteIds, setSelectedNoteIds] = useState<string[]>([]);

  const videoController = useMemo(() => {
    return new VideoControllerImpl(() => videoRef.current, uploadResource);
  }, [uploadResource]);

  const extensions = useMemo(() => {
    return createVideoNoteExtensions(videoController);
  }, [videoController]);

  const formatTime = useMemoizedFn((time: number) => {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
  });

  // 检查选择的卡片是否连续
  const canMergeSelected = useMemo(() => {
    if (selectedNoteIds.length < 2) return false;

    // 获取选中笔记的索引
    const selectedIndices = selectedNoteIds
      .map((id) => notes.findIndex((note) => note.id === id))
      .filter((index) => index !== -1)
      .sort((a, b) => a - b);

    // 检查索引是否连续
    for (let i = 1; i < selectedIndices.length; i++) {
      if (selectedIndices[i] !== selectedIndices[i - 1] + 1) {
        return false;
      }
    }

    return true;
  }, [selectedNoteIds, notes]);

  const handleAddNote = useMemoizedFn(() => {
    const newNote = {
      id: uuidv4(),
      startTime: videoController.getCurrentTime(),
      content: [
        {
          type: "paragraph",
          children: [
            {
              type: "formatted",
              text: "",
            },
          ],
        },
      ] as Descendant[],
      count: 0,
    };

    const updatedNotes = produce(notes, (draft) => {
      draft.push(newNote);
    });
    setNotes(updatedNotes);

    if (onNotesChange) {
      onNotesChange(updatedNotes);
    }

    if (editorSections.length === 1) {
      setEditorSections([
        {
          noteId: newNote.id,
          height: 300,
        },
      ]);
    } else {
      setEditorSections((prev) => [
        ...prev,
        {
          noteId: newNote.id,
          height: 300,
        },
      ]);
    }
  });

  const handleNoteChange = useMemoizedFn(
    (noteId: string, content: Descendant[]) => {
      const updatedNotes = produce(notes, (draft) => {
        const note = draft.find((note) => note.id === noteId);
        if (note) {
          note.content = content;
          note.count = getContentLength(content);
        }
      });
      setNotes(updatedNotes);

      if (onNotesChange) {
        onNotesChange(updatedNotes);
      }
    },
  );

  const handleNoteClick = useMemoizedFn((noteId: string) => {
    // 在选择模式下，点击应该选择/取消选择而不是打开编辑
    if (isSelectionMode) {
      toggleSelectNote(noteId);
      return;
    }

    const note = notes.find((n) => n.id === noteId);
    if (note) {
      videoController.seekTo(note.startTime);
    }
    if (!editorSections.find((section) => section.noteId === noteId)) {
      setEditorSections((prev) => [
        ...prev,
        {
          noteId,
          height: 300,
        },
      ]);
    }
  });

  const handleDeleteNote = useMemoizedFn((noteId: string) => {
    const updatedNotes = notes.filter((note) => note.id !== noteId);
    setNotes(updatedNotes);

    if (onNotesChange) {
      onNotesChange(updatedNotes);
    }

    if (editorSections.find((section) => section.noteId === noteId)) {
      setEditorSections((prev) =>
        prev.filter((section) => section.noteId !== noteId),
      );
    }
  });

  const handleExitEdit = useMemoizedFn(() => {
    setEditorSections([]);
  });

  const handleResizeSection = useMemoizedFn(
    (noteId: string, height: number) => {
      setEditorSections((prev) =>
        prev.map((section) =>
          section.noteId === noteId ? { ...section, height } : section,
        ),
      );
    },
  );

  const handleExitEditByNoteId = useMemoizedFn((noteId: string) => {
    setEditorSections((prev) =>
      prev.filter((section) => section.noteId !== noteId),
    );
  });

  const handleSlideCardDrop = useMemoizedFn((noteId: string) => {
    if (!editorSections.find((section) => section.noteId === noteId)) {
      setEditorSections((prev) => [
        ...prev,
        {
          noteId,
          height: 300,
        },
      ]);
    }
  });

  const handleMoveEditorSection = useMemoizedFn(
    (dragIndex: number, hoverIndex: number) => {
      setEditorSections((prev) => {
        const newEditorSections = [...prev];
        const [removed] = newEditorSections.splice(dragIndex, 1);
        newEditorSections.splice(hoverIndex, 0, removed);
        return newEditorSections;
      });
    },
  );

  // 切换选择模式
  const toggleSelectionMode = useMemoizedFn(() => {
    setIsSelectionMode(!isSelectionMode);
    if (isSelectionMode) {
      // 退出选择模式时清空选择
      setSelectedNoteIds([]);
    }
  });

  // 选择/取消选择笔记
  const toggleSelectNote = useMemoizedFn((noteId: string) => {
    setSelectedNoteIds((prev) => {
      if (prev.includes(noteId)) {
        return prev.filter((id) => id !== noteId);
      } else {
        return [...prev, noteId];
      }
    });
  });

  // 批量删除
  const handleBatchDelete = useMemoizedFn(() => {
    if (selectedNoteIds.length === 0) return;

    const updatedNotes = notes.filter(
      (note) => !selectedNoteIds.includes(note.id),
    );
    setNotes(updatedNotes);

    if (onNotesChange) {
      onNotesChange(updatedNotes);
    }

    // 移除已删除笔记的编辑区域
    setEditorSections((prev) =>
      prev.filter((section) => !selectedNoteIds.includes(section.noteId)),
    );

    // 删除后清空选择
    setSelectedNoteIds([]);
    setIsSelectionMode(false);
  });

  // 合并笔记
  const handleBatchMerge = useMemoizedFn(() => {
    if (selectedNoteIds.length < 2 || !canMergeSelected) return;

    // 获取选中的笔记
    const selectedNotes = notes
      .filter((note) => selectedNoteIds.includes(note.id))
      .sort((a, b) => a.startTime - b.startTime);

    // 创建合并后的新笔记
    const mergedNote = {
      id: uuidv4(),
      startTime: selectedNotes[0].startTime, // 使用最小的startTime
      content: selectedNotes.flatMap((note) => note.content) as Descendant[],
      count: selectedNotes.reduce((total, note) => total + note.count, 0),
    };

    // 找到最大的高度
    const maxHeight = Math.max(
      ...selectedNotes.map(
        (note) =>
          editorSections.find((section) => section.noteId === note.id)
            ?.height || 300,
      ),
    );

    // 更新笔记列表
    const updatedNotes = produce(notes, (draft) => {
      // 找到第一个选中笔记的索引
      const firstIndex = draft.findIndex(
        (note) => note.id === selectedNotes[0].id,
      );

      // 删除所有选中的笔记
      const filteredDraft = draft.filter(
        (note) => !selectedNoteIds.includes(note.id),
      );

      // 在第一个选中笔记的位置插入合并后的笔记
      filteredDraft.splice(firstIndex, 0, mergedNote);

      return filteredDraft;
    });

    setNotes(updatedNotes);

    if (onNotesChange) {
      onNotesChange(updatedNotes);
    }

    // 更新编辑区
    const hasSelectedInEditor = editorSections.some((section) =>
      selectedNoteIds.includes(section.noteId),
    );

    if (hasSelectedInEditor) {
      // 如果有选中的笔记在编辑区，将合并后的笔记添加到编辑区
      setEditorSections((prev) => {
        // 过滤掉已合并的笔记
        const filtered = prev.filter(
          (section) => !selectedNoteIds.includes(section.noteId),
        );

        // 添加合并后的新笔记
        return [
          ...filtered,
          {
            noteId: mergedNote.id,
            height: maxHeight,
          },
        ];
      });
    }

    // 合并后清空选择
    setSelectedNoteIds([]);
    setIsSelectionMode(false);
  });

  return {
    videoRef,
    notes,
    extensions,
    handleAddNote,
    handleNoteChange,
    handleNoteClick,
    handleDeleteNote,
    formatTime,
    editorSections,
    handleExitEdit,
    handleResizeSection,
    handleExitEditByNoteId,
    handleSlideCardDrop,
    handleMoveEditorSection,
    isSelectionMode,
    toggleSelectionMode,
    selectedNoteIds,
    toggleSelectNote,
    handleBatchDelete,
    handleBatchMerge,
    canMergeSelected,
  };
};
