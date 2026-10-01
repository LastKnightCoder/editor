import { useCallback, useEffect, useRef, useState } from "react";
import { useRafInterval, useUnmount } from "ahooks";
import { toast } from "@tau/ui";
import {
  offTextFileChanged,
  onTextFileChanged,
  readTextFile,
  unwatchTextFile,
  watchTextFile,
  writeTextFile,
  type TextFileChangedPayload,
} from "@/commands/file";
import type { SaveState } from "./types";

const AUTOSAVE_INTERVAL_MS = 500;

/**
 * 单个文本文件的编辑会话：读取、自动保存（无变化跳过）、外部修改监听。
 * 会话与路径一一绑定（视图按路径 key 重建），切换文件不会把内容写进别的文件。
 *
 * 外部修改：本地无未保存改动 → 静默载入；有 → 进入冲突（暂停自动保存，由用户选择）；
 * 文件不见了 → 进入 missing（暂停自动保存，内容留在内存，可重新保存 / 另存）。
 */
export function useTextFileSession({
  path,
  getText,
  applyExternalText,
  ready = true,
}: {
  path: string;
  /** 编辑器当前全文 */
  getText: () => string;
  /** 载入外部版本到编辑器 */
  applyExternalText: (text: string) => void;
  /** 正文投影尚未完成初始化时，不允许自动保存空内容。 */
  ready?: boolean;
}) {
  const [initialText, setInitialText] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [conflict, setConflict] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);

  const savedText = useRef("");
  const writing = useRef<Promise<void> | null>(null);
  const writeVersion = useRef(0);
  const loaded = initialText !== null;
  const pausedRef = useRef(false);
  pausedRef.current = !loaded || !ready || conflict !== null || missing;

  useEffect(() => {
    let alive = true;
    readTextFile(path).then(
      text => {
        if (!alive) return;
        savedText.current = text;
        setInitialText(text);
      },
      error => alive && setLoadError(error instanceof Error ? error.message : String(error))
    );
    return () => {
      alive = false;
    };
  }, [path]);

  const write = useCallback(
    async (text: string) => {
      writeVersion.current++;
      const task = (async () => {
        setSaveState("saving");
        try {
          await writeTextFile(path, text);
          savedText.current = text;
          setSaveState(getText() === text ? "saved" : "dirty");
        } catch (error) {
          console.error(`保存失败 ${path}:`, error);
          setSaveState("error");
        }
      })();
      writing.current = task;
      await task;
      if (writing.current === task) writing.current = null;
    },
    [getText, path]
  );

  const save = useCallback(async () => {
    if (writing.current) await writing.current;
    if (pausedRef.current) return;
    const text = getText();
    if (text === savedText.current) {
      setSaveState(state => (state === "error" ? state : "saved"));
      return;
    }
    await write(text);
  }, [getText, write]);

  useRafInterval(() => void save(), AUTOSAVE_INTERVAL_MS);
  useUnmount(() => void save());

  const markDirty = useCallback(() => {
    setSaveState(state => (state === "saving" ? state : "dirty"));
  }, []);

  // 外部修改监听
  useEffect(() => {
    if (!loaded) return;
    let active = true;
    let version = 0;
    void watchTextFile(path).catch(error => console.error("监听文件失败:", error));
    const onChanged = async (_event: unknown, payload: TextFileChangedPayload) => {
      if (payload?.filePath !== path || writing.current) return;
      const request = ++version;
      const beforeWrite = writeVersion.current;
      let text: string;
      try {
        text = await readTextFile(path);
      } catch {
        if (active && request === version && beforeWrite === writeVersion.current) setMissing(true);
        return;
      }
      if (!active || request !== version || beforeWrite !== writeVersion.current || writing.current)
        return;
      setMissing(false);
      if (text === savedText.current) return;
      const current = getText();
      if (text === current) {
        savedText.current = text;
        setSaveState("saved");
        return;
      }
      if (current !== savedText.current) {
        setConflict(text);
        return;
      }
      applyExternalText(text);
      savedText.current = text;
      toast.info("已同步外部修改");
    };
    onTextFileChanged(onChanged);
    return () => {
      active = false;
      version++;
      offTextFileChanged(onChanged);
      void unwatchTextFile(path).catch(() => undefined);
    };
  }, [applyExternalText, getText, loaded, path]);

  const loadExternal = useCallback(() => {
    if (conflict === null) return;
    applyExternalText(conflict);
    savedText.current = conflict;
    setConflict(null);
    setSaveState("saved");
  }, [applyExternalText, conflict]);

  const keepMine = useCallback(async () => {
    setConflict(null);
    await write(getText());
  }, [getText, write]);

  const resave = useCallback(async () => {
    setMissing(false);
    await write(getText());
  }, [getText, write]);

  const flush = useCallback(async () => {
    await save();
  }, [save]);

  return {
    initialText,
    loadError,
    saveState,
    conflict,
    missing,
    markDirty,
    flush,
    save,
    loadExternal,
    keepMine,
    resave,
  };
}
