import { Node as SlateNode, Path, Range, Text, type Editor } from "slate";
import { defineExtension, type MarkRenderProps } from "@tau/editor/api";
import {
  formatRecordingTime,
  recordingDestinationFor,
  subscribeRecordingMarker,
  useRecordingState,
} from "./recordingSession";

type MarkerLeaf = Text & { recordingMarker?: "before" | "after" };

/** 计时单独订阅，避免每次电平更新都重算整篇文档的装饰 */
function MarkerBadge() {
  const state = useRecordingState();
  if (!state) return null;
  const paused = state.phase === "paused";
  return (
    <span
      contentEditable={false}
      data-recording-marker=""
      className="border-danger/55 bg-danger-soft text-danger my-2 flex h-[30px] items-center gap-1.5 rounded-[10px] border-[1.5px] border-dashed px-2.5 text-[12.5px] font-semibold select-none"
    >
      <span
        className={
          paused
            ? "bg-ink-3 size-[7px] rounded-full"
            : "bg-danger size-[7px] animate-pulse rounded-full"
        }
      />
      {state.phase === "saving" ? "正在保存录音" : paused ? "录音已暂停" : "录音将插入这里"}
      <span className="text-ink-3 ml-auto font-normal tabular-nums">
        {formatRecordingTime(state.elapsedMs)}
      </span>
    </span>
  );
}

function RecordingMarkerMark({ leaf, children }: MarkRenderProps) {
  const side = (leaf as MarkerLeaf).recordingMarker;
  if (!side) return <>{children}</>;
  return side === "before" ? (
    <>
      <MarkerBadge />
      {children}
    </>
  ) : (
    <>
      {children}
      <MarkerBadge />
    </>
  );
}

/** 标记画在落点块的首个（之前）或末个（之后）文本叶子上；重新录制不画 */
function markerPoint(editor: Editor): { path: Path; side: "before" | "after" } | null {
  const destination = recordingDestinationFor(editor);
  if (destination?.kind !== "insert") return null;
  const block = destination.anchor.ref.current;
  if (!block || !SlateNode.has(editor, block)) return null;
  const side = destination.anchor.before ? "before" : "after";
  try {
    const [, path] =
      side === "before" ? SlateNode.first(editor, block) : SlateNode.last(editor, block);
    return { path, side };
  } catch {
    return null;
  }
}

export const recordingMarkerExtension = defineExtension({
  id: "host.recording-marker",
  marks: [
    {
      id: "host.recording-marker.mark",
      keys: ["recordingMarker"],
      render: RecordingMarkerMark,
    },
  ],
  decorations: [
    {
      id: "host.recording-marker",
      decorate: (editor, [node, path]) => {
        if (!Text.isText(node)) return [];
        const point = markerPoint(editor);
        if (!point || !Path.equals(point.path, path)) return [];
        const offset = point.side === "before" ? 0 : node.text.length;
        const at = { path, offset };
        return [{ anchor: at, focus: at, recordingMarker: point.side } as Range];
      },
      subscribe: (editor, invalidate) => subscribeRecordingMarker(editor, invalidate),
    },
  ],
});
