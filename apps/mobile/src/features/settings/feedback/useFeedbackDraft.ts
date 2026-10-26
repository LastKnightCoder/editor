// 反馈草稿：字段持久化到 localStorage（退出页面不丢，提交成功后清除）；
// 图片压缩后暂存到 Rust（提交失败重试直接复用，成功即清除）。
// clientRequestId 按草稿签名生成：内容变化换新 ID，原样重试复用同一 ID（服务端据此幂等）。

import { useCallback, useEffect, useRef, useState } from "react";
import {
  APP_FEEDBACK_LIMITS,
  type AppFeedbackKind,
  type FeedbackSubmitInput,
  type FeedbackUiContext,
  discardFeedbackImage,
  stageFeedbackImage,
} from "../../../services/appFeedback";
import { compressImage } from "./image";

export interface FeedbackFields {
  kind: AppFeedbackKind;
  message: string;
  includeContext: boolean;
  includeLogs: boolean;
}

const EMPTY_FIELDS: FeedbackFields = {
  kind: "bug",
  message: "",
  includeContext: true,
  includeLogs: false,
};

const DRAFT_KEY = "tau-feedback-draft";
const KINDS: AppFeedbackKind[] = ["bug", "idea", "other"];

export interface FeedbackImage {
  id: string;
  previewUrl: string;
}

function loadFields(): FeedbackFields {
  try {
    const saved = JSON.parse(localStorage.getItem(DRAFT_KEY) ?? "") as Partial<FeedbackFields>;
    if (saved && typeof saved === "object") {
      const kind = KINDS.find(item => item === saved.kind);
      return {
        ...EMPTY_FIELDS,
        kind: kind ?? EMPTY_FIELDS.kind,
        message: typeof saved.message === "string" ? saved.message : "",
        includeContext: saved.includeContext !== false,
        includeLogs: saved.includeLogs === true,
      };
    }
  } catch {
    // 草稿损坏时回到空白
  }
  return EMPTY_FIELDS;
}

export function useFeedbackDraft() {
  const [fields, setFields] = useState<FeedbackFields>(loadFields);
  const [images, setImages] = useState<FeedbackImage[]>([]);
  const [processing, setProcessing] = useState(0);
  const [imageError, setImageError] = useState<string | null>(null);
  const imagesRef = useRef(images);
  imagesRef.current = images;
  const request = useRef<{ signature: string; id: string } | null>(null);

  useEffect(() => {
    const touched =
      fields.message.trim() !== "" ||
      fields.kind !== EMPTY_FIELDS.kind ||
      fields.includeContext !== EMPTY_FIELDS.includeContext ||
      fields.includeLogs !== EMPTY_FIELDS.includeLogs;
    if (touched) localStorage.setItem(DRAFT_KEY, JSON.stringify(fields));
    else localStorage.removeItem(DRAFT_KEY);
  }, [fields]);

  const update = useCallback((patch: Partial<FeedbackFields>) => {
    setFields(current => ({ ...current, ...patch }));
  }, []);

  /** 返回 false 表示已达上限、无法解码或暂存失败（imageError 带原因） */
  const addImage = useCallback(async (file: Blob) => {
    if (imagesRef.current.length >= APP_FEEDBACK_LIMITS.images) {
      setImageError(`最多附带 ${APP_FEEDBACK_LIMITS.images} 张截图`);
      return false;
    }
    setProcessing(count => count + 1);
    try {
      const compressed = await compressImage(file);
      const id = crypto.randomUUID();
      try {
        await stageFeedbackImage(id, compressed.bytes);
      } catch (error) {
        URL.revokeObjectURL(compressed.previewUrl);
        throw error;
      }
      setImages(current => [...current, { id, previewUrl: compressed.previewUrl }]);
      setImageError(null);
      return true;
    } catch (error) {
      setImageError(
        error instanceof Error && error.message ? error.message : "截图处理失败，请换一张试试"
      );
      return false;
    } finally {
      setProcessing(count => count - 1);
    }
  }, []);

  const removeImage = useCallback((id: string) => {
    setImages(current => {
      const target = current.find(item => item.id === id);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return current.filter(item => item.id !== id);
    });
    discardFeedbackImage(id);
  }, []);

  const reset = useCallback(() => {
    imagesRef.current.forEach(item => {
      URL.revokeObjectURL(item.previewUrl);
      discardFeedbackImage(item.id);
    });
    imagesRef.current = [];
    setImages([]);
    setFields(EMPTY_FIELDS);
    setImageError(null);
    request.current = null;
  }, []);

  const ready =
    fields.message.trim().length > 0 &&
    fields.message.length <= APP_FEEDBACK_LIMITS.message &&
    processing === 0;

  const toInput = (uiContext: FeedbackUiContext): FeedbackSubmitInput => {
    const signature = JSON.stringify([fields, images.map(item => item.id)]);
    if (request.current?.signature !== signature)
      request.current = { signature, id: crypto.randomUUID() };
    return {
      kind: fields.kind,
      message: fields.message,
      includeContext: fields.includeContext,
      uiContext,
      clientRequestId: request.current.id,
      imageIds: images.map(item => item.id),
      includeLogs: fields.includeLogs,
    };
  };

  return {
    fields,
    update,
    images,
    addImage,
    removeImage,
    processing,
    imageError,
    ready,
    reset,
    toInput,
  };
}

export type FeedbackDraft = ReturnType<typeof useFeedbackDraft>;
