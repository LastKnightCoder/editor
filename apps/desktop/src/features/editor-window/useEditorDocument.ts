import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRafInterval, useUnmount } from "ahooks";
import {
  metadataSignature,
  type DocumentDriver,
  type DocumentFields,
  type EditorDocument,
} from "./documentDrivers";

export type DocumentStatus = "loading" | "ready" | "missing";
export type SaveState = "saved" | "saving" | "error";

const SAVE_INTERVAL_MS = 500;

/**
 * 编辑窗口的文档状态：加载、本地编辑态、定时落库（无变化跳过）、跨实例同步。
 * 窗口重新获得焦点时回查一次：文档在别处被删除时切到 missing（删除不跨窗口广播）。
 */
export function useEditorDocument(driver: DocumentDriver, id: number) {
  const [entity, setEntity] = useState<unknown>(null);
  const [status, setStatus] = useState<DocumentStatus>("loading");
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const entityRef = useRef<unknown>(null);
  entityRef.current = entity;
  const savedSignature = useRef("");
  const bus = useMemo(() => driver.createBus(), [driver]);

  const load = useCallback(async () => {
    try {
      return await driver.load(id);
    } catch (error) {
      console.error(`[editor-window] 加载${driver.label}失败:`, error);
      return null;
    }
  }, [driver, id]);

  useEffect(() => {
    let alive = true;
    void load().then(loaded => {
      if (!alive) return;
      setEntity(loaded);
      savedSignature.current = loaded ? metadataSignature(loaded) : "";
      setStatus(loaded ? "ready" : "missing");
    });
    return () => {
      alive = false;
    };
  }, [load]);

  // 远端元数据更新：正文保留本地（编辑器是正文真源，本地态只供字数 / 大纲）
  useEffect(
    () =>
      bus.subscribe(id, remote => {
        savedSignature.current = metadataSignature(remote);
        setEntity((previous: unknown) =>
          previous
            ? driver.withFields(remote, { content: driver.toDocument(previous).content })
            : remote
        );
      }),
    [bus, driver, id]
  );

  useEffect(() => {
    const onFocus = () => {
      void load().then(latest => {
        if (!latest) setStatus(current => (current === "ready" ? "missing" : current));
      });
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [load]);

  const persist = useCallback(async () => {
    const current = entityRef.current;
    if (!current) return;
    const signature = metadataSignature(current);
    if (signature === savedSignature.current) return;
    savedSignature.current = signature;
    setSaveState("saving");
    try {
      const saved = await driver.save(current);
      if (saved) bus.publish(saved);
      setSaveState("saved");
    } catch (error) {
      console.error(`[editor-window] 保存${driver.label}失败:`, error);
      // 下一轮重试
      savedSignature.current = "";
      setSaveState("error");
    }
  }, [bus, driver]);

  useRafInterval(() => void persist(), SAVE_INTERVAL_MS);
  useUnmount(() => void persist());

  const updateFields = useCallback(
    (fields: DocumentFields) =>
      setEntity((previous: unknown) => (previous ? driver.withFields(previous, fields) : previous)),
    [driver]
  );

  const document: EditorDocument | null = entity ? driver.toDocument(entity) : null;
  return { document, status, saveState, updateFields };
}
