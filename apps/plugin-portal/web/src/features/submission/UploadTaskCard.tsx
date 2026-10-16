import { X } from "lucide-react";
import { Button, IconButton, Spinner, cn } from "@tau/ui";
import { Notice } from "../../components/Notice";
import { formatBytes } from "./validation";
import type { UploadTask, UploadTasks } from "./useUploadTasks";

function ProgressBar({ ratio, verifying }: { ratio: number; verifying?: boolean }) {
  return (
    <div className="bg-track h-1.5 overflow-hidden rounded-full" aria-hidden>
      <div
        className={cn(
          "bg-accent h-full rounded-full transition-[width] duration-200",
          verifying && "animate-pulse"
        )}
        style={{ width: `${Math.round(ratio * 100)}%` }}
      />
    </div>
  );
}

/** 单个上传任务：进行中显示进度，结束后显示结果与可选动作 */
export function UploadTaskCard({ task, uploads }: { task: UploadTask; uploads: UploadTasks }) {
  const { view, key, fileName, size } = task;
  const dismiss = (
    <IconButton aria-label="关闭" onClick={() => uploads.dismiss(key)}>
      <X size={14} />
    </IconButton>
  );

  if (view.phase !== "settled") {
    const cancellable = view.phase !== "confirming";
    let label: string;
    let ratio = 0;
    switch (view.phase) {
      case "preparing":
        label = "正在申请上传…";
        break;
      case "uploading":
        ratio = view.total ? view.loaded / view.total : 0;
        label = `上传中 ${Math.round(ratio * 100)}% · ${formatBytes(view.loaded)} / ${formatBytes(view.total)}`;
        break;
      case "verifying":
        ratio = 1;
        label = "已上传，服务端校验中…";
        break;
      case "confirming":
        label = "正在核对服务端的上传结果…";
        break;
    }
    return (
      <div
        className="border-line-1 bg-surface rounded-tau-md flex flex-col gap-2 border px-4 py-3"
        aria-live="polite"
      >
        <div className="flex items-center gap-3">
          {(view.phase === "preparing" || view.phase === "confirming") && <Spinner />}
          <div className="min-w-0 flex-1">
            <p className="text-tau-sm text-ink-1 truncate font-medium">{fileName}</p>
            <p className="text-tau-micro text-ink-3">{label}</p>
          </div>
          {cancellable && (
            <Button size="sm" variant="ghost" onClick={() => uploads.cancel(key)}>
              取消
            </Button>
          )}
        </div>
        {(view.phase === "uploading" || view.phase === "verifying") && (
          <ProgressBar ratio={ratio} verifying={view.phase === "verifying"} />
        )}
        {view.phase === "verifying" && (
          <p className="text-tau-micro text-ink-3">
            此时取消只会停止等待，服务端可能仍会完成处理。
          </p>
        )}
      </div>
    );
  }

  const { outcome } = view;
  const name = `${fileName}（${formatBytes(size)}）`;
  switch (outcome.type) {
    case "canceled":
      return (
        <Notice tone="info" title="已取消上传" actions={dismiss}>
          {name}
        </Notice>
      );
    case "canceled-ready":
      return (
        <Notice
          tone="info"
          title="取消前文件已上传完成"
          actions={
            <>
              <Button size="sm" variant="soft" onClick={() => uploads.accept(key)}>
                仍然使用
              </Button>
              <Button size="sm" variant="ghost" onClick={() => uploads.dismiss(key)}>
                放弃
              </Button>
            </>
          }
        >
          {name} 已通过服务端静态校验。
        </Notice>
      );
    case "invalid":
      return (
        <Notice tone="danger" title="未通过校验" actions={dismiss}>
          {name}：{outcome.message}
        </Notice>
      );
    case "failed":
      return (
        <Notice tone="danger" title="上传失败" actions={dismiss}>
          {name}：{outcome.message}
        </Notice>
      );
    case "pending":
      return (
        <Notice
          tone="warn"
          title="服务端仍在校验"
          actions={
            <>
              <Button size="sm" variant="ghost" onClick={() => uploads.retryCheck(key)}>
                立即核对
              </Button>
              {dismiss}
            </>
          }
        >
          {name} 的处理尚未结束，稍后会自动核对。
        </Notice>
      );
    case "unconfirmed":
      return (
        <Notice
          tone="warn"
          title="上传结果未确认"
          actions={
            <>
              <Button size="sm" variant="ghost" onClick={() => uploads.retryCheck(key)}>
                重新核对
              </Button>
              {dismiss}
            </>
          }
        >
          {name}：{outcome.message}
        </Notice>
      );
    case "ready":
      return null;
  }
}
