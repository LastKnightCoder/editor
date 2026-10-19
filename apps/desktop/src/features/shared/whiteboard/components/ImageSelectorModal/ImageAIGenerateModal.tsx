/**
 * AI 图片生成：描述画面 → 生成并插入（D-049）。
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
  const [prompt, setPrompt] = useState("");
  const [error, setError] = useState<string | null>(null);
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
      setError("请输入图片生成要求");
      return;
    }

    const controller = new AbortController();
    taskRef.current = controller;
    try {
      setError(null);
      setSubmitting(true);
      await onConfirm(finalPrompt, controller.signal);
    } catch (err) {
      if (controller.signal.aborted || (err as Error).name === "AbortError") return;
      setError((err as Error).message || "AI 图片生成失败");
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
      title="AI 图片生成"
      icon={<Sparkles strokeWidth={1.75} />}
      subtitle="使用设置中的图片模型，生成后插入第一张结果"
      width={480}
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={onCancel} disabled={submitting}>
            取消
          </Button>
          <Button
            variant="primary"
            size="sm"
            loading={submitting}
            loadingText="生成中…"
            disabled={!prompt.trim() || !canGenerate}
            onClick={handleSubmit}
          >
            生成并插入
          </Button>
        </>
      }
    >
      <DialogBody>
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-ink-2 text-[12px]">生成要求</span>
            <Textarea
              data-autofocus
              rows={4}
              value={prompt}
              onChange={e => {
                setPrompt(e.target.value);
                setError(null);
              }}
              onKeyDown={handleKeyDown}
              placeholder="例如：一张干净的产品架构示意图，浅色背景，包含数据流、服务层和用户端"
              aria-invalid={error ? true : undefined}
            />
          </label>

          {!canGenerate && (
            <p className="text-tau-meta text-ink-2">
              请先在图片生成设置中选择支持生成的图片插件账号。
            </p>
          )}
          {error && (
            <p className="bg-danger-soft text-danger rounded-tau-sm px-3 py-2 text-[12.5px]">
              {error}
            </p>
          )}
        </div>
      </DialogBody>
    </Dialog>
  );
};

export default ImageAIGenerateModal;
