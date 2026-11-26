import {
  imageModalIssueText,
  useImageWebviewI18n,
  type ImageModalIssue,
} from "../../image-webview.i18n";
/**
 * AI 图片生成：描述画面 → 生成并插入。
 * 生成中主按钮走 Button loading；⌘/Ctrl + Enter 提交。
 */

import React, { useEffect, useRef, useState } from "react";
import { Sparkles } from "lucide-react";
import { useMemoizedFn } from "ahooks";
import { Button, Dialog, DialogBody, Textarea } from "@tau/ui";
import { useImageCapabilities } from "@/services/image-capabilities";

interface ImageAIGenerateModalProps {
  open: boolean;
  onCancel: () => void;
  onConfirm: (prompt: string, signal: AbortSignal) => Promise<void> | void;
}

const ImageAIGenerateModal: React.FC<ImageAIGenerateModalProps> = ({
  open,
  onCancel,
  onConfirm,
}) => {
  const { t } = useImageWebviewI18n();
  const [prompt, setPrompt] = useState("");
  const [error, setError] = useState<ImageModalIssue | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const canGenerate = useImageCapabilities(state => state.canGenerate);
  const taskRef = useRef<AbortController | null>(null);
  useEffect(
    () => () => {
      taskRef.current?.abort();
    },
    [open]
  );

  // 每次打开都从空白开始
  useEffect(() => {
    if (!open) return;
    setPrompt("");
    setError(null);
    setSubmitting(false);
  }, [open]);

  const handleSubmit = useMemoizedFn(async () => {
    if (submitting || !canGenerate) return;
    const finalPrompt = prompt.trim();
    if (!finalPrompt) {
      setError({ kind: "prompt-required" });
      return;
    }

    const controller = new AbortController();
    taskRef.current = controller;
    try {
      setError(null);
      setSubmitting(true);
      await onConfirm(finalPrompt, controller.signal);
    } catch (err) {
      if (
        controller.signal.aborted ||
        (err && typeof err === "object" && "name" in err && err.name === "AbortError")
      )
        return;
      setError({ kind: "generate", cause: err });
    } finally {
      if (!controller.signal.aborted) setSubmitting(false);
    }
  });

  const handleKeyDown = useMemoizedFn((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && !e.nativeEvent.isComposing) {
      e.preventDefault();
      handleSubmit();
    }
  });

  return (
    <Dialog
      open={open}
      onOpenChange={next => !next && onCancel()}
      locked={submitting}
      title={t("image.aiTitle")}
      icon={<Sparkles strokeWidth={1.75} />}
      subtitle={t("image.aiHint")}
      width={480}
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={onCancel} disabled={submitting}>
            {t("cancel")}
          </Button>
          <Button
            variant="primary"
            size="sm"
            loading={submitting}
            loadingText={t("image.generating")}
            disabled={!prompt.trim() || !canGenerate}
            onClick={handleSubmit}
          >
            {t("image.generateInsert")}
          </Button>
        </>
      }
    >
      <DialogBody>
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-ink-2 text-[12px]">{t("image.prompt")}</span>
            <Textarea
              data-autofocus
              rows={4}
              value={prompt}
              onChange={e => {
                setPrompt(e.target.value);
                setError(null);
              }}
              onKeyDown={handleKeyDown}
              placeholder={t("image.promptPlaceholder")}
              aria-invalid={error ? true : undefined}
            />
          </label>

          {!canGenerate && <p className="text-tau-meta text-ink-2">{t("image.setup")}</p>}
          {error && (
            <p className="bg-danger-soft text-danger rounded-tau-sm px-3 py-2 text-[12.5px]">
              {imageModalIssueText(error)}
            </p>
          )}
        </div>
      </DialogBody>
    </Dialog>
  );
};

export default ImageAIGenerateModal;
