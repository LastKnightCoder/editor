import { useState, useEffect, useCallback, useRef } from "react";
import { v4 as uuidv4 } from "uuid";
import type { Descendant } from "slate";
import type { NoteMetadata } from "../utils/types";

const DEFAULT_NOTE_CONTENT: Descendant[] = [
  { type: "paragraph", children: [{ type: "formatted", text: "" }] },
];

interface UseNotesReturn {
  notes: NoteMetadata[];
  activeNoteId: string | null;
  content: Descendant[] | null;
  isLoading: boolean;
  createNote: () => Promise<void>;
  deleteNote: (noteId: string) => Promise<void>;
  renameNote: (noteId: string, title: string) => Promise<void>;
  selectNote: (noteId: string) => void;
  saveNoteContent: (content: Descendant[]) => void;
  /** 更新指定笔记在指定数据库下的 contentId */
  updateNoteContentId: (
    noteId: string,
    dbName: string,
    contentId: number,
    options?: {
      syncedContentUpdateTime?: number;
      contentUpdatedAt?: number;
    }
  ) => Promise<void>;
  /** 获取当前活动笔记在指定数据库下的 contentId */
  getContentId: (dbName: string) => number | null;
  /** 获取当前活动笔记在指定数据库下的最近一次同步远端更新时间 */
  getSyncedContentUpdateTime: (dbName: string) => number | null;
  /** 用远端内容覆盖当前活动笔记，并同步落盘相关元数据 */
  replaceActiveNoteContent: (
    content: Descendant[],
    options?: {
      dbName?: string;
      contentId?: number;
      syncedContentUpdateTime?: number;
      contentUpdatedAt?: number;
    }
  ) => Promise<void>;
}

export const STORAGE_PREFIX_META = "tau-notes-meta:";
export const STORAGE_PREFIX_CONTENT = "tau-note-content:";

/**
 * 管理单个 URL 下的多笔记生命周期
 */
export function useNotes(url: string | null): UseNotesReturn {
  const [notes, setNotes] = useState<NoteMetadata[]>([]);
  const [activeNoteId, setActiveNoteId] = useState<string | null>(null);
  const [content, setContent] = useState<Descendant[] | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const notesRef = useRef<NoteMetadata[]>([]);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentUrlRef = useRef(url);

  useEffect(() => {
    notesRef.current = notes;
  }, [notes]);

  const clearSaveTimer = useCallback(() => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
  }, []);

  // 加载笔记列表元数据
  const loadNotesMeta = useCallback(async (url: string) => {
    try {
      const key = `${STORAGE_PREFIX_META}${url}`;
      const result = await chrome.storage.local.get(key);
      const notesMeta = result[key] as NoteMetadata[] | undefined;

      return notesMeta && notesMeta.length > 0
        ? notesMeta.map(note => ({
            ...note,
            contentUpdatedAt: note.contentUpdatedAt ?? note.updatedAt,
          }))
        : [];
    } catch (error) {
      console.error("Failed to load notes meta:", error);
      return [];
    }
  }, []);

  // 加载单个笔记的内容
  const loadNoteContent = useCallback(async (noteId: string) => {
    try {
      const key = `${STORAGE_PREFIX_CONTENT}${noteId}`;
      const result = await chrome.storage.local.get(key);
      const noteContent = result[key] as Descendant[] | undefined;

      return noteContent || DEFAULT_NOTE_CONTENT;
    } catch (error) {
      console.error("Failed to load note content:", error);
      return DEFAULT_NOTE_CONTENT;
    }
  }, []);

  // 保存笔记元数据列表
  const saveNotesMeta = useCallback(async (url: string, notesMeta: NoteMetadata[]) => {
    try {
      const key = `${STORAGE_PREFIX_META}${url}`;
      await chrome.storage.local.set({ [key]: notesMeta });
    } catch (error) {
      console.error("Failed to save notes meta:", error);
    }
  }, []);

  // 保存笔记内容（debounced）
  const saveNoteContent = useCallback(
    (newContent: Descendant[]) => {
      if (!activeNoteId || !currentUrlRef.current) return;
      const editedAt = Date.now();

      clearSaveTimer();

      const optimisticNotes = notesRef.current.map(note =>
        note.id === activeNoteId
          ? {
              ...note,
              updatedAt: editedAt,
              contentUpdatedAt: editedAt,
            }
          : note
      );
      notesRef.current = optimisticNotes;
      setNotes(optimisticNotes);
      setContent(newContent);

      // 设置新的定时器（1s debounce）
      saveTimerRef.current = setTimeout(async () => {
        try {
          const contentKey = `${STORAGE_PREFIX_CONTENT}${activeNoteId}`;
          await chrome.storage.local.set({ [contentKey]: newContent });

          // 更新元数据的 updatedAt
          const metaKey = `${STORAGE_PREFIX_META}${currentUrlRef.current}`;
          const result = await chrome.storage.local.get(metaKey);
          const notesMeta = (result[metaKey] || []) as NoteMetadata[];

          const updatedMeta = notesMeta.map(note =>
            note.id === activeNoteId
              ? {
                  ...note,
                  updatedAt: editedAt,
                  contentUpdatedAt: editedAt,
                }
              : note
          );

          await chrome.storage.local.set({ [metaKey]: updatedMeta });
          notesRef.current = updatedMeta;
          setNotes(updatedMeta);
        } catch (error) {
          console.error("Failed to save note content:", error);
        }
      }, 1000);
    },
    [activeNoteId, clearSaveTimer]
  );

  // 新建笔记
  const createNote = useCallback(async () => {
    if (!currentUrlRef.current) return;
    const now = Date.now();

    const nextIndex = notesRef.current.length + 1;
    const newNote: NoteMetadata = {
      id: uuidv4(),
      title: `笔记 ${nextIndex}`,
      createdAt: now,
      updatedAt: now,
      contentUpdatedAt: now,
    };

    const updatedNotes = [...notesRef.current, newNote];
    notesRef.current = updatedNotes;
    setNotes(updatedNotes);
    await saveNotesMeta(currentUrlRef.current, updatedNotes);

    // 自动切换到新笔记
    setActiveNoteId(newNote.id);
    setContent(DEFAULT_NOTE_CONTENT);

    // 立即保存默认内容
    const contentKey = `${STORAGE_PREFIX_CONTENT}${newNote.id}`;
    await chrome.storage.local.set({ [contentKey]: DEFAULT_NOTE_CONTENT });
  }, [saveNotesMeta]);

  // 删除笔记
  const deleteNote = useCallback(
    async (noteId: string) => {
      if (!currentUrlRef.current) return;

      // 删除内容
      const contentKey = `${STORAGE_PREFIX_CONTENT}${noteId}`;
      await chrome.storage.local.remove(contentKey);

      // 更新元数据列表
      const updatedNotes = notesRef.current.filter(note => note.id !== noteId);
      notesRef.current = updatedNotes;
      setNotes(updatedNotes);
      await saveNotesMeta(currentUrlRef.current, updatedNotes);

      // 如果删除的是当前活动笔记，切换到第一个或清空
      if (activeNoteId === noteId) {
        const firstNote = updatedNotes[0];
        if (firstNote) {
          setActiveNoteId(firstNote.id);
          const newContent = await loadNoteContent(firstNote.id);
          setContent(newContent);
        } else {
          setActiveNoteId(null);
          setContent(null);
        }
      }
    },
    [activeNoteId, loadNoteContent, saveNotesMeta]
  );

  // 重命名笔记
  const renameNote = useCallback(
    async (noteId: string, newTitle: string) => {
      if (!currentUrlRef.current) return;

      const updatedNotes = notesRef.current.map(note =>
        note.id === noteId ? { ...note, title: newTitle, updatedAt: Date.now() } : note
      );

      notesRef.current = updatedNotes;
      setNotes(updatedNotes);
      await saveNotesMeta(currentUrlRef.current, updatedNotes);
    },
    [saveNotesMeta]
  );

  // 切换活动笔记
  const selectNote = useCallback(
    async (noteId: string) => {
      if (noteId === activeNoteId) return;

      setActiveNoteId(noteId);
      setIsLoading(true);

      const newContent = await loadNoteContent(noteId);
      setContent(newContent);
      setIsLoading(false);
    },
    [activeNoteId, loadNoteContent]
  );

  // 更新指定笔记在指定数据库下的 contentId
  const updateNoteContentId = useCallback(
    async (
      noteId: string,
      dbName: string,
      contentId: number,
      options?: {
        syncedContentUpdateTime?: number;
        contentUpdatedAt?: number;
      }
    ) => {
      if (!currentUrlRef.current) return;
      const nextUpdatedAt = options?.contentUpdatedAt ?? Date.now();

      const updatedNotes = notesRef.current.map(note => {
        if (note.id !== noteId) return note;
        const contentIdMap = {
          ...(note.contentIdMap || {}),
          [dbName]: contentId,
        };
        const syncedContentUpdateTimeMap =
          typeof options?.syncedContentUpdateTime === "number"
            ? {
                ...(note.syncedContentUpdateTimeMap || {}),
                [dbName]: options.syncedContentUpdateTime,
              }
            : note.syncedContentUpdateTimeMap;
        return {
          ...note,
          contentIdMap,
          syncedContentUpdateTimeMap,
          updatedAt: nextUpdatedAt,
          contentUpdatedAt: options?.contentUpdatedAt ?? note.contentUpdatedAt,
        };
      });

      notesRef.current = updatedNotes;
      setNotes(updatedNotes);
      await saveNotesMeta(currentUrlRef.current, updatedNotes);
    },
    [saveNotesMeta]
  );

  // 获取当前活动笔记在指定数据库下的 contentId
  const getContentId = useCallback(
    (dbName: string): number | null => {
      if (!activeNoteId) return null;
      const note = notesRef.current.find(n => n.id === activeNoteId);
      return note?.contentIdMap?.[dbName] ?? null;
    },
    [activeNoteId]
  );

  const getSyncedContentUpdateTime = useCallback(
    (dbName: string): number | null => {
      if (!activeNoteId) return null;
      const note = notesRef.current.find(n => n.id === activeNoteId);
      return note?.syncedContentUpdateTimeMap?.[dbName] ?? null;
    },
    [activeNoteId]
  );

  const replaceActiveNoteContent = useCallback(
    async (
      newContent: Descendant[],
      options?: {
        dbName?: string;
        contentId?: number;
        syncedContentUpdateTime?: number;
        contentUpdatedAt?: number;
      }
    ) => {
      if (!activeNoteId || !currentUrlRef.current) return;

      clearSaveTimer();

      const nextUpdatedAt = options?.contentUpdatedAt ?? Date.now();
      const updatedNotes = notesRef.current.map(note => {
        if (note.id !== activeNoteId) return note;

        const contentIdMap =
          options?.dbName && typeof options.contentId === "number"
            ? {
                ...(note.contentIdMap || {}),
                [options.dbName]: options.contentId,
              }
            : note.contentIdMap;
        const syncedContentUpdateTimeMap =
          options?.dbName && typeof options.syncedContentUpdateTime === "number"
            ? {
                ...(note.syncedContentUpdateTimeMap || {}),
                [options.dbName]: options.syncedContentUpdateTime,
              }
            : note.syncedContentUpdateTimeMap;

        return {
          ...note,
          contentIdMap,
          syncedContentUpdateTimeMap,
          updatedAt: nextUpdatedAt,
          contentUpdatedAt: nextUpdatedAt,
        };
      });

      const contentKey = `${STORAGE_PREFIX_CONTENT}${activeNoteId}`;
      await chrome.storage.local.set({ [contentKey]: newContent });
      notesRef.current = updatedNotes;
      setNotes(updatedNotes);
      setContent(newContent);
      await saveNotesMeta(currentUrlRef.current, updatedNotes);
    },
    [activeNoteId, clearSaveTimer, saveNotesMeta]
  );

  // URL 变化时重新加载笔记列表
  useEffect(() => {
    if (!url) {
      notesRef.current = [];
      setNotes([]);
      setActiveNoteId(null);
      setContent(null);
      setIsLoading(false);
      return;
    }

    currentUrlRef.current = url;
    setIsLoading(true);

    (async () => {
      const notesMeta = await loadNotesMeta(url);
      notesRef.current = notesMeta;
      setNotes(notesMeta);

      if (notesMeta.length > 0) {
        const firstNote = notesMeta[0];
        setActiveNoteId(firstNote.id);

        const noteContent = await loadNoteContent(firstNote.id);
        setContent(noteContent);
      } else {
        setActiveNoteId(null);
        setContent(null);
      }

      setIsLoading(false);
    })();

    // 清理定时器
    return () => {
      clearSaveTimer();
    };
  }, [url, loadNotesMeta, loadNoteContent, clearSaveTimer]);

  return {
    notes,
    activeNoteId,
    content,
    isLoading,
    createNote,
    deleteNote,
    renameNote,
    selectNote,
    saveNoteContent,
    updateNoteContentId,
    getContentId,
    getSyncedContentUpdateTime,
    replaceActiveNoteContent,
  };
}
