import { useEffect, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Check, Loader2, X } from "lucide-react";
import type { JoinRequest } from "@tau/collaboration";
import { decideJoinRequest } from "@/commands";
import useCollaborationStore from "@/stores/useCollaborationStore";
import PortalToBody from "@/components/PortalToBody";

interface VisibleNotification {
  request: JoinRequest;
  deciding?: boolean;
  decidingApprove?: boolean;
  error?: string;
}

/** 完整展开的通知数上限，更多的以 Mac 通知栏式真实卡片层叠在下方。 */
const MAX_EXPANDED = 3;
/** 堆叠层数上限：完整卡下方最多再层叠 2 张真实卡片（仅露出顶部边缘）。 */
const MAX_STACKED = 2;
/** 堆叠卡片从上一张背后伸出的底部边缘高度（px），越深层叠露出越少。 */
const STACK_EDGE = 10;
const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];

/**
 * 作者侧加入申请通知：运行期间新到达的待审批申请在窗口右上角弹卡片，
 * 可直接同意/拒绝。启动时已存在的申请静默跳过（状态栏徽标兜底）。
 * 新通知插入最上方，最多完整展示 3 张；更多以真实卡片层叠在下方，
 * 从完整态沉入堆叠态是一次连续的高度/缩放补间。
 */
export default function JoinRequestNotifications() {
  const requests = useCollaborationStore(state => state.requests);
  const sessions = useCollaborationStore(state => state.sessions);
  const synced = useCollaborationStore(state => state.synced);
  // null 表示尚未完成首次同步；首次见到的申请一律视为存量，不弹通知。
  const seenRef = useRef<Set<string> | null>(null);
  const [visible, setVisible] = useState<VisibleNotification[]>([]);

  useEffect(() => {
    if (!synced) return;
    const pending = requests.filter(request => request.status === "pending");
    if (seenRef.current === null) {
      seenRef.current = new Set(pending.map(request => request.id));
      return;
    }
    const seen = seenRef.current;
    setVisible(current => {
      // 已在他处处理/过期的申请随 store 同步移除
      const kept = current.filter(
        item => item.deciding || pending.some(request => request.id === item.request.id)
      );
      // 仅弹出来从未见过的申请；手动关闭过的（已入 seen）不再打扰
      const additions = pending
        .filter(request => !seen.has(request.id))
        .map(request => ({ request }));
      for (const request of pending) seen.add(request.id);
      if (!additions.length && kept.length === current.length) return current;
      // 服务端按申请时间升序返回，反转后最新的在最上方（Mac 通知栏顺序）
      return [...additions.reverse(), ...kept];
    });
  }, [requests, synced]);

  const dismiss = (id: string) => {
    setVisible(current => current.filter(item => item.request.id !== id));
  };

  const decide = async (id: string, approve: boolean) => {
    setVisible(current =>
      current.map(item =>
        item.request.id === id
          ? { ...item, deciding: true, decidingApprove: approve, error: undefined }
          : item
      )
    );
    try {
      await decideJoinRequest(id, approve);
      setVisible(current => current.filter(item => item.request.id !== id));
    } catch (failure) {
      setVisible(current =>
        current.map(item =>
          item.request.id === id
            ? {
                ...item,
                deciding: false,
                error: failure instanceof Error ? failure.message : "操作失败",
              }
            : item
        )
      );
    }
  };

  if (!visible.length) return null;
  const shown = visible.slice(0, MAX_EXPANDED + MAX_STACKED);

  return (
    <PortalToBody>
      <div className="pointer-events-none fixed right-6 top-[58px] z-[10030] flex w-[320px] flex-col gap-2">
        <AnimatePresence>
          {shown.map(({ request, deciding, decidingApprove, error }, index) => (
            <NotificationSlot
              key={request.id}
              stacked={index >= MAX_EXPANDED}
              depth={index - MAX_EXPANDED}
              index={index}
            >
              <JoinRequestCard
                request={request}
                stacked={index >= MAX_EXPANDED}
                depth={index - MAX_EXPANDED}
                title={sessions.find(session => session.id === request.documentId)?.title}
                deciding={deciding}
                decidingApprove={decidingApprove}
                error={error}
                onDismiss={() => dismiss(request.id)}
                onDecide={approve => void decide(request.id, approve)}
              />
            </NotificationSlot>
          ))}
        </AnimatePresence>
      </div>
    </PortalToBody>
  );
}

/**
 * 通知槽位：Mac 通知栏式的真实遮挡堆叠。
 * 卡片完整渲染、绝对定位贴槽位底部——堆叠时槽位高度收拢为一条边，
 * 卡片主体向上伸入上一张卡片的区域、被其（更高的 z-index）真实盖住，
 * 只从底部伸出自己的边缘，因此没有 overflow 截断感。
 * 布局流（展开占位、收拢、兄弟让位）全部由 height/marginTop 数值补间驱动。
 */
function NotificationSlot({
  stacked,
  depth,
  index,
  children,
}: {
  stacked: boolean;
  depth: number;
  index: number;
  children: ReactNode;
}) {
  const innerRef = useRef<HTMLDivElement>(null);
  const [naturalHeight, setNaturalHeight] = useState(0);
  useEffect(() => {
    const el = innerRef.current;
    if (!el) return;
    const update = () => setNaturalHeight(el.offsetHeight);
    update();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return (
    <motion.div
      initial={{ opacity: 0, x: 48, height: 0, marginTop: 0 }}
      animate={{
        opacity: stacked ? 0.95 - depth * 0.05 : 1,
        x: 0,
        height: stacked ? Math.max(8, STACK_EDGE - depth * 2) : naturalHeight || "auto",
        marginTop: stacked ? -9 - depth * 2 : 0,
      }}
      exit={{ opacity: 0, x: 48, height: 0, marginTop: 0 }}
      transition={{ duration: 0.26, ease: EASE }}
      className="relative"
      style={{ zIndex: 100 - index, pointerEvents: stacked ? "none" : "auto" }}
    >
      <div ref={innerRef} className="absolute inset-x-0 bottom-0">
        {children}
      </div>
    </motion.div>
  );
}

function JoinRequestCard({
  request,
  title,
  stacked,
  depth,
  deciding,
  decidingApprove,
  error,
  onDismiss,
  onDecide,
}: {
  request: JoinRequest;
  title?: string;
  stacked: boolean;
  depth: number;
  deciding?: boolean;
  decidingApprove?: boolean;
  error?: string;
  onDismiss: () => void;
  onDecide: (approve: boolean) => void;
}) {
  return (
    <motion.div
      role="status"
      data-testid="join-request-notification"
      data-stacked={stacked || undefined}
      aria-label={`${request.nickname} 请求加入协作`}
      animate={{ scale: stacked ? 1 - (depth + 1) * 0.06 : 1 }}
      transition={{ duration: 0.26, ease: EASE }}
      style={{ transformOrigin: "bottom center" }}
      className="border-border-1 text-text-1 bg-normal-card flex flex-col gap-2.5 rounded-2xl border px-4 py-3.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.10)] drop-shadow-[0_12px_32px_rgba(15,23,42,0.28)] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] dark:drop-shadow-[0_14px_36px_rgba(0,0,0,0.6)]"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 pt-px">
          <p className="m-0 text-[13px] font-semibold leading-5">{request.nickname}</p>
          <p className="text-text-3 m-0 mt-0.5 truncate text-xs leading-4" title={title}>
            请求加入协作{title ? ` · ${title}` : ""}
          </p>
        </div>
        <button
          type="button"
          aria-label="关闭"
          className="text-text-3 hover:bg-hover hover:text-text-1 -mr-1 -mt-0.5 flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-md border-0 bg-transparent p-0 transition duration-150 ease-out"
          onClick={onDismiss}
        >
          <X size={14} />
        </button>
      </div>
      {error && (
        <p className="text-status-error m-0 rounded-lg bg-[color-mix(in_oklab,var(--th-danger)_10%,transparent)] px-2.5 py-1.5 text-xs leading-4 [overflow-wrap:anywhere]">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-1.5">
        <button
          type="button"
          className="bg-tag-bg text-text-2 hover:bg-hover hover:text-text-1 inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border-0 px-3 text-xs font-medium transition duration-150 ease-out focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--th-border-focus)] active:scale-95 disabled:cursor-default disabled:opacity-50"
          disabled={deciding}
          onClick={() => onDecide(false)}
        >
          {deciding && decidingApprove === false ? (
            <Loader2 size={13} className="animate-spin" />
          ) : (
            <X size={13} />
          )}
          拒绝
        </button>
        <button
          type="button"
          className="bg-status-success inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border-0 px-3.5 text-xs font-semibold text-white shadow-[0_3px_12px_-3px_color-mix(in_oklab,var(--th-success)_55%,transparent)] transition duration-150 ease-out hover:bg-[color-mix(in_oklab,var(--th-success)_85%,black)] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--th-border-focus)] active:scale-95 disabled:cursor-default disabled:opacity-50"
          disabled={deciding}
          onClick={() => onDecide(true)}
        >
          {deciding && decidingApprove !== false ? (
            <Loader2 size={13} className="animate-spin" />
          ) : (
            <Check size={13} />
          )}
          同意
        </button>
      </div>
    </motion.div>
  );
}
