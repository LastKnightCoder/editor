// 详情页的原地协作会话（懒加载 chunk，与协作运行时同舟）：绑定协作的内容无需跳转协作页，
// 直接在详情页切换为 yjs 协同编辑。职责内聚：运行时挂载、Y.Doc 绑定、owner 侧投影、
// presence 上报、状态条与裁决弹窗。
//
// 正文编辑器由详情页统一渲染（页面只有一个编辑器实例），本组件把协作文档源经
// onDocumentChange 上报：协作与本机的文档源同谱系，切换即换源，编辑器不重建。
// 会话建立失败时上报「本地兜底」模式，改动经投影通道落本地库，重连后拉出
// 「保留本机 / 采用云端」裁决。
import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronRight, Loader2, RefreshCw, Users, WifiOff } from "lucide-react";
import type { EditorDocument } from "@tau/editor";
import { createYjsDocument } from "@tau/editor-collab";
import { contentLineage } from "../../hooks/useLocalContentDocument";
import { AvatarStack, StatusDot } from "./components/CollaborationUI";
import { LocalFallbackChoiceDialog } from "./components/LocalFallbackChoiceDialog";
import { useCollabSession } from "./hooks/useCollabSession";
import { useCollaborationRuntime } from "./hooks/useCollaborationRuntime";
import { hasPendingLocalFallback, clearPendingLocalFallback } from "./local-fallback";
import { useNavigator } from "../../router";

/** 会话建立迟迟不成功（无错误但也没就绪）多久后转本地兜底编辑 */
const CONNECT_STALL_MS = 8000;

/** 宿主据此决定编辑器归属：connecting=本地只读过渡；live=协作编辑；
 *  unavailable=连接不可用，本地兜底编辑；ended=共享已结束，退回普通本地编辑 */
export type CollaborativeEditorMode = "connecting" | "live" | "unavailable" | "ended";

export function CollaborativeEditor(props: {
  documentId: string;
  /** 本机内容 id：与本机文档源共用谱系，切换时编辑器换源而不是重建 */
  contentId?: number;
  /** 协作文档源上报给宿主（正文编辑器由宿主渲染，全页只有一个实例） */
  onDocumentChange: (document: EditorDocument | undefined) => void;
  presenceRef?: (presence: { onFocus: () => void; onBlur: () => void }) => void;
  /** 生效只读（binding 未就绪 / 会话冻结 / 非 active / 待裁决）上报：宿主据此收起编辑工具栏 */
  onReadonlyChange?: (readonly: boolean) => void;
  /** 编辑模式上报（见 CollaborativeEditorMode） */
  onModeChange?: (mode: CollaborativeEditorMode) => void;
  /** 在共享与成员 Sheet 里主动结束共享/退出：结果直接回传，宿主据此退出协作态 */
  onCollaborationEnded?: () => void;
}) {
  const navigator = useNavigator();
  useCollaborationRuntime();
  // 重连后仍有本机兜底改动待裁决：暂停投影（绝不让云端覆盖待决改动），先让作者选择
  const [pendingChoice, setPendingChoice] = useState(false);
  const [stalled, setStalled] = useState(false);
  const {
    binding,
    loading,
    error,
    boundContentId,
    ended,
    retry,
    readonly,
    presence,
    status,
    online,
    offline,
  } = useCollabSession(props.documentId, { projectionPaused: pendingChoice });
  // 待裁决期间正文只读：本机改动必须先二选一，不允许继续编辑制造第三个版本
  const viewReadonly = readonly || pendingChoice;
  // 会话建立失败或长时间未就绪：交给详情页用本地编辑器兜底（作者数据在本地，不应被只读挡住）
  const unavailable = !binding && !loading && (Boolean(error) || stalled);
  // 已结束优先于不可用：作者主动结束共享属正常路径，不该出现「连接失败+重试」
  const mode: CollaborativeEditorMode = ended
    ? "ended"
    : binding
      ? "live"
      : unavailable
        ? "unavailable"
        : "connecting";

  // 回调经 ref 转发，避免懒加载边界上的闭包过期
  const onReadonlyChangeRef = useRef(props.onReadonlyChange);
  onReadonlyChangeRef.current = props.onReadonlyChange;
  const onModeChangeRef = useRef(props.onModeChange);
  onModeChangeRef.current = props.onModeChange;
  const onDocumentChangeRef = useRef(props.onDocumentChange);
  onDocumentChangeRef.current = props.onDocumentChange;
  const presenceRefCallback = useRef(props.presenceRef);
  presenceRefCallback.current = props.presenceRef;
  // 与本机文档源共用谱系：编辑器据此在协作与本机之间换源，不重建
  const document = useMemo(
    () =>
      binding
        ? createYjsDocument(binding, { lineage: contentLineage(props.contentId) })
        : undefined,
    [binding, props.contentId]
  );

  // 只读态为真时不上报文档源：待裁决期间正文归本机，避免云端内容盖住待决改动
  useEffect(() => {
    onDocumentChangeRef.current(pendingChoice ? undefined : document);
    return () => onDocumentChangeRef.current(undefined);
  }, [document, pendingChoice]);

  useEffect(() => {
    presenceRefCallback.current?.(presence);
  }, [presence]);

  // 上报的是生效只读（含待裁决）：宿主的那个编辑器据此决定可否编辑
  useEffect(() => {
    onReadonlyChangeRef.current?.(viewReadonly);
  }, [viewReadonly]);

  useEffect(() => {
    onModeChangeRef.current?.(mode);
  }, [mode]);

  // 连接迟迟不落地（无错误也无会话，含静默失败）：超过阈值按失败处理，转本地兜底编辑
  useEffect(() => {
    if (binding) {
      setStalled(false);
      return;
    }
    const timer = setTimeout(() => setStalled(true), CONNECT_STALL_MS);
    return () => clearTimeout(timer);
  }, [binding]);

  // 会话就绪且本机有兜底改动：拉出裁决弹窗（此前投影保持暂停）
  useEffect(() => {
    if (!binding || !boundContentId) return;
    if (hasPendingLocalFallback(boundContentId)) setPendingChoice(true);
  }, [binding, boundContentId]);

  // 共享已结束：本地内容即真相源，离线兜底标记不再需要裁决
  useEffect(() => {
    if (ended && boundContentId) clearPendingLocalFallback(boundContentId);
  }, [ended, boundContentId]);

  /** 打开共享与成员 Sheet；在其中主动结束共享时由 Sheet 回传结果，直接通知宿主退出协作态 */
  const openDetails = async () => {
    try {
      const outcome = await navigator.pushForResult<string>("memberSheet", {
        documentId: props.documentId,
      });
      if (outcome === "ended") props.onCollaborationEnded?.();
    } catch {
      // 遮罩/返回关闭：未结束共享，无需处理
    }
  };

  // 共享已结束：本组件退场，宿主用普通本地编辑器接管（无需任何状态条）
  if (ended) {
    return null;
  }

  if (!binding) {
    return unavailable ? (
      <div className="bg-tag-4-soft text-warn mt-4 flex items-center gap-2.5 rounded-[14px] px-3.5 py-2.5 text-[12.5px] font-semibold">
        <WifiOff size={15} className="shrink-0" />
        <span className="flex-1">协作连接失败，正在编辑本地内容（暂不同步云端）</span>
        <button
          type="button"
          onClick={retry}
          className="bg-surface/70 flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[11.5px] font-bold active:opacity-70"
        >
          <RefreshCw size={12} strokeWidth={2.6} />
          重试
        </button>
      </div>
    ) : (
      <div className="text-ink-2 mt-4 flex items-center gap-2 text-[12.5px] font-semibold">
        <Loader2 size={14} className="animate-spin" />
        正在连接协作…
      </div>
    );
  }

  return (
    <>
      <button
        type="button"
        aria-label="协作详情与成员"
        // 本页已可原地协作编辑，横条不再跳协作页：点开共享与成员 Sheet
        //（协作码 / 审批 / 移除 / 结束共享）；进协作编辑页的入口保留在 ⋯ 菜单「查看协作」
        onClick={() => void openDetails()}
        className="bg-tag-4-soft text-tag-4 mt-4 flex w-full items-center gap-2 rounded-[14px] px-3.5 py-2.5 text-left text-[12.5px] font-semibold active:opacity-70"
      >
        <Users size={15} className="shrink-0" strokeWidth={2.2} />
        <span className="min-w-0 flex-1">
          正在协作 · {status?.label ?? "连接中"}
          {online.length > 0 ? ` · ${online.length} 人` : ""}
        </span>
        {online.length > 0 ? <AvatarStack members={online} /> : null}
        <ChevronRight size={14} className="shrink-0 opacity-70" />
      </button>

      {offline ? (
        <div className="bg-tag-4-soft text-warn mt-2.5 flex items-center gap-2.5 rounded-[14px] px-3.5 py-2.5 text-[12.5px] font-semibold">
          <WifiOff size={15} className="shrink-0" />
          <span className="flex-1">
            {status?.label ?? "网络已断开"} · 改动保留在本机，恢复后自动同步
          </span>
        </div>
      ) : null}

      {viewReadonly && !offline && !pendingChoice ? (
        <div className="bg-tag-4-soft text-warn mt-2.5 flex items-center gap-2.5 rounded-[14px] px-3.5 py-2.5 text-[12.5px] font-semibold">
          <StatusDot tone={status?.tone ?? "idle"} />
          <span className="flex-1">{status?.label ?? "协作暂不可用"} · 正文暂为只读</span>
        </div>
      ) : null}

      <LocalFallbackChoiceDialog
        open={pendingChoice}
        documentId={props.documentId}
        boundContentId={boundContentId}
        onResolved={() => setPendingChoice(false)}
      />
    </>
  );
}

export default CollaborativeEditor;
