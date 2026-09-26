/**
 * 插入网络图片：地址输入 + 实时预览（D-049）。
 * 地址合法（http/https）才出预览与可点的「插入」；校验仍走 validateImageUrl。
 */

import React, { useEffect, useState } from "react";
import { ImageIcon } from "lucide-react";
import { useMemoizedFn } from "ahooks";
import { Button, Dialog, DialogBody, Input, cn } from "@tau/ui";
import { validateImageUrl } from "./imageActions";

interface ImageUrlModalProps {
  open: boolean;
  onCancel: () => void;
  onConfirm: (url: string) => Promise<void> | void;
}

/** 预览只看「像不像地址」，真正的校验与报错在提交时 */
const looksLikeImageUrl = (value: string) => /^https?:\/\/\S+/i.test(value.trim());

type PreviewState = "idle" | "loading" | "ok" | "error";

const ImageUrlModal: React.FC<ImageUrlModalProps> = ({ open, onCancel, onConfirm }) => {
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ url: string; ok: boolean } | null>(null);

  // 每次打开都从空白开始，上次的残留不带入
  useEffect(() => {
    if (!open) return;
    setUrl("");
    setError(null);
    setSubmitting(false);
    setResult(null);
  }, [open]);

  const previewUrl = looksLikeImageUrl(url) ? url.trim() : "";

  // 预览状态 render 期派生：缓存图的 onLoad 可能先于重置 effect 触发，
  // 用 state 存结果再派生，避免被后到的重置覆写回 loading
  const preview: PreviewState = !previewUrl
    ? "idle"
    : result?.url === previewUrl
      ? result.ok
        ? "ok"
        : "error"
      : "loading";

  const handleSubmit = useMemoizedFn(async () => {
    if (submitting) return;
    try {
      const finalUrl = validateImageUrl(url);
      setError(null);
      setSubmitting(true);
      await onConfirm(finalUrl);
    } catch (err) {
      setError((err as Error).message || "插入图片失败");
    } finally {
      setSubmitting(false);
    }
  });

  const handleKeyDown = useMemoizedFn((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.nativeEvent.isComposing) {
      e.preventDefault();
      handleSubmit();
    }
  });

  return (
    <Dialog
      open={open}
      onOpenChange={next => !next && onCancel()}
      locked={submitting}
      title="插入图片"
      width={460}
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={onCancel} disabled={submitting}>
            取消
          </Button>
          <Button
            variant="primary"
            size="sm"
            loading={submitting}
            loadingText="插入中…"
            disabled={!url.trim()}
            onClick={handleSubmit}
          >
            插入
          </Button>
        </>
      }
    >
      <DialogBody>
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-ink-2 text-[12px]">图片地址</span>
            <Input
              data-autofocus
              value={url}
              onChange={e => {
                setUrl(e.target.value);
                setError(null);
              }}
              onKeyDown={handleKeyDown}
              placeholder="https://example.com/image.png"
              aria-invalid={error ? true : undefined}
            />
          </label>

          {/* 预览：常驻占位，地址变化只换内容，不顶开布局 */}
          <div className="bg-page ring-line-1 rounded-tau-md relative grid h-40 place-items-center overflow-hidden ring-1 ring-inset">
            {previewUrl && (
              <img
                key={previewUrl}
                src={previewUrl}
                alt=""
                onLoad={() => setResult({ url: previewUrl, ok: true })}
                onError={() => setResult({ url: previewUrl, ok: false })}
                className={cn(
                  "absolute inset-0 size-full object-contain p-2",
                  preview === "ok" ? "opacity-100" : "opacity-0"
                )}
              />
            )}
            {preview !== "ok" && (
              <div className="text-ink-3 flex flex-col items-center gap-1.5 text-[12px]">
                <ImageIcon className="size-[22px]" strokeWidth={1.5} />
                <span>
                  {preview === "loading"
                    ? "正在加载预览…"
                    : preview === "error"
                      ? "无法加载这张图片"
                      : "粘贴地址后在这里预览"}
                </span>
              </div>
            )}
          </div>

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

export default ImageUrlModal;
