import { useCallback, useEffect, useRef, useState } from "react";
import {
  APP_FEEDBACK_LIMITS,
  type AppFeedbackKind,
  type AppFeedbackSubmitInput,
} from "@/types/app-feedback";
import { exportScreenshot, type Annotation } from "./image";

export interface Screenshot {
  id: string;
  /** 原图常驻内存，重新标注时从原图重画，打码不会叠加劣化 */
  source: ImageBitmap;
  annotations: Annotation[];
  /** 来源说明：主窗口 / 剪贴板 / 文件名 */
  origin: string;
  webp: Uint8Array | null;
  previewUrl: string | null;
  error: string | null;
}

export interface FeedbackFields {
  kind: AppFeedbackKind;
  message: string;
  includeContext: boolean;
  logs: { app: boolean; perf: boolean };
}

const EMPTY_FIELDS: FeedbackFields = {
  kind: "bug",
  message: "",
  includeContext: true,
  logs: { app: false, perf: false },
};

const release = (shot: Screenshot) => {
  if (shot.previewUrl) URL.revokeObjectURL(shot.previewUrl);
  shot.source.close();
};

/** 反馈草稿：字段 + 截图（原图、标注、压缩产物）；内容变化时更换请求 ID，原样重试则复用 */
export function useFeedbackDraft() {
  const [fields, setFields] = useState<FeedbackFields>(EMPTY_FIELDS);
  const [screenshots, setScreenshots] = useState<Screenshot[]>([]);
  const shotsRef = useRef(screenshots);
  shotsRef.current = screenshots;
  const request = useRef<{ signature: string; id: string } | null>(null);

  useEffect(() => () => shotsRef.current.forEach(release), []);

  const update = useCallback(
    (patch: Partial<FeedbackFields>) => setFields(current => ({ ...current, ...patch })),
    []
  );

  const render = useCallback(async (id: string) => {
    const shot = shotsRef.current.find(item => item.id === id);
    if (!shot) return;
    try {
      const webp = await exportScreenshot(shot.source, shot.annotations);
      const previewUrl = URL.createObjectURL(new Blob([webp], { type: "image/webp" }));
      setScreenshots(current =>
        current.map(item => {
          if (item.id !== id || item.annotations !== shot.annotations) {
            if (item.id === id) URL.revokeObjectURL(previewUrl);
            return item;
          }
          if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
          return { ...item, webp, previewUrl, error: null };
        })
      );
    } catch (error) {
      setScreenshots(current =>
        current.map(item =>
          item.id === id
            ? { ...item, error: error instanceof Error ? error.message : "截图处理失败" }
            : item
        )
      );
    }
  }, []);

  /** 返回 false 表示已达上限或无法解码 */
  const addImage = useCallback(
    async (blob: Blob, origin: string) => {
      if (shotsRef.current.length >= APP_FEEDBACK_LIMITS.images) return false;
      let source: ImageBitmap;
      try {
        source = await createImageBitmap(blob);
      } catch {
        return false;
      }
      if (shotsRef.current.length >= APP_FEEDBACK_LIMITS.images) {
        source.close();
        return false;
      }
      const shot: Screenshot = {
        id: crypto.randomUUID(),
        source,
        annotations: [],
        origin,
        webp: null,
        previewUrl: null,
        error: null,
      };
      shotsRef.current = [...shotsRef.current, shot];
      setScreenshots(shotsRef.current);
      void render(shot.id);
      return true;
    },
    [render]
  );

  const removeImage = useCallback((id: string) => {
    const shot = shotsRef.current.find(item => item.id === id);
    if (shot) release(shot);
    shotsRef.current = shotsRef.current.filter(item => item.id !== id);
    setScreenshots(shotsRef.current);
  }, []);

  const setAnnotations = useCallback(
    (id: string, annotations: Annotation[]) => {
      shotsRef.current = shotsRef.current.map(item =>
        item.id === id ? { ...item, annotations, webp: null } : item
      );
      setScreenshots(shotsRef.current);
      void render(id);
    },
    [render]
  );

  const reset = useCallback(() => {
    shotsRef.current.forEach(release);
    shotsRef.current = [];
    setScreenshots([]);
    setFields(EMPTY_FIELDS);
    request.current = null;
  }, []);

  const processing = screenshots.some(shot => !shot.webp && !shot.error);
  const ready =
    !!fields.message.trim() &&
    fields.message.length <= APP_FEEDBACK_LIMITS.message &&
    !processing &&
    screenshots.every(shot => shot.webp);

  const toInput = (theme: string | null): AppFeedbackSubmitInput => {
    const images = screenshots.map(shot => shot.webp!);
    const signature = JSON.stringify([fields, screenshots.map(shot => shot.annotations), theme]);
    if (request.current?.signature !== signature)
      request.current = { signature, id: crypto.randomUUID() };
    return {
      kind: fields.kind,
      message: fields.message,
      clientRequestId: request.current.id,
      includeContext: fields.includeContext,
      theme: fields.includeContext ? theme : null,
      images,
      logs: fields.logs,
    };
  };

  const dirty = !!fields.message.trim() || screenshots.length > 0;

  return {
    fields,
    update,
    screenshots,
    addImage,
    removeImage,
    setAnnotations,
    reset,
    ready,
    processing,
    dirty,
    toInput,
  };
}

export type FeedbackDraft = ReturnType<typeof useFeedbackDraft>;
