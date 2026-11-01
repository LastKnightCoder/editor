import { LoaderCircle, TriangleAlert } from "lucide-react";
import {
  cancelTranscription,
  dismissTranscriptionError,
  retryTranscription,
  useTranscriptionTask,
} from "./transcription";

const STAGE_LABELS = {
  preparing: "正在准备音频",
  uploading: "正在上传",
  recognizing: "正在转文字",
} as const;

/**
 * 音频块下方的转写进度 / 失败行；运行时状态，不写进文档。
 * 音频插槽也用于编辑器外的插件媒体，不依赖 Slate 上下文。
 */
export function TranscriptionStatus(props: { src: string }) {
  const task = useTranscriptionTask(props.src);
  if (!task) return null;
  if (task.status === "failed") {
    const retry = () => retryTranscription(props.src);
    return (
      <div
        contentEditable={false}
        className="border-line-2 text-danger mt-2 flex items-center gap-2 border-t pt-2 text-[12.5px]"
      >
        <TriangleAlert size={15} className="shrink-0" />
        <span className="min-w-0 flex-1">{task.error}</span>
        <button type="button" className="text-accent-text px-1 font-semibold" onClick={retry}>
          重试
        </button>
        <button
          type="button"
          className="text-ink-2 px-1"
          onClick={() => dismissTranscriptionError(props.src)}
        >
          关闭
        </button>
      </div>
    );
  }
  return (
    <div
      contentEditable={false}
      className="border-line-2 text-ink-2 mt-2 flex items-center gap-2 border-t pt-2 text-[12.5px]"
    >
      <LoaderCircle size={15} className="text-accent shrink-0 animate-spin" />
      <span className="shrink-0">{STAGE_LABELS[task.stage]}</span>
      <span className="bg-line-1 h-1 min-w-0 flex-1 overflow-hidden rounded-full">
        {task.fraction !== null ? (
          <i
            className="bg-accent block h-full rounded-full"
            style={{ width: `${Math.round(task.fraction * 100)}%` }}
          />
        ) : null}
      </span>
      {task.fraction !== null ? (
        <span className="tabular-nums">{Math.round(task.fraction * 100)}%</span>
      ) : null}
      <button
        type="button"
        className="text-ink-2 px-1 font-semibold"
        onClick={() => cancelTranscription(props.src)}
      >
        取消
      </button>
    </div>
  );
}
