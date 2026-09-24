import { useEffect, useRef } from "react";
import { notify } from "@tau/ui";
import type { JoinRequest } from "@tau/collaboration";
import { decideJoinRequest } from "@/commands";
import useCollaborationStore from "@/stores/useCollaborationStore";

const noticeId = (requestId: string) => `join-request:${requestId}`;

/**
 * 作者侧加入申请通知：运行期间新到达的待审批申请经 notify 弹出（卡栈由壳层
 * NotificationHost 承载），可直接同意/拒绝。启动时已存在的申请静默跳过（状态栏徽标兜底）；
 * 手动关闭过的不再打扰；申请在别处处理或过期后，对应通知随 store 同步关闭——
 * 正在作答的除外，让结果行或错误完整呈现。
 */
export default function JoinRequestNotifications() {
  const requests = useCollaborationStore(state => state.requests);
  const synced = useCollaborationStore(state => state.synced);
  // null 表示尚未完成首次同步；首次见到的申请一律视为存量，不弹通知
  const seenRef = useRef<Set<string> | null>(null);
  /** 已弹出且仍可能在屏上的申请 */
  const shownRef = useRef(new Set<string>());
  /** 正在作答（decide 请求未落定）的申请 */
  const decidingRef = useRef(new Set<string>());

  useEffect(() => {
    if (!synced) return;
    const pending = requests.filter(request => request.status === "pending");
    if (seenRef.current === null) {
      seenRef.current = new Set(pending.map(request => request.id));
      return;
    }
    const seen = seenRef.current;
    const shown = shownRef.current;

    for (const id of shown) {
      if (decidingRef.current.has(id) || pending.some(request => request.id === id)) continue;
      shown.delete(id);
      notify.dismiss(noticeId(id));
    }

    const decide = (id: string, approve: boolean) => {
      decidingRef.current.add(id);
      const run = decideJoinRequest(id, approve);
      // 成功：通知自行收成结果行退场；失败：通知留在栈里报错，仍受 store 同步关闭
      void run
        .then(
          () => shown.delete(id),
          () => undefined
        )
        .finally(() => decidingRef.current.delete(id));
      return run;
    };

    // 服务端按申请时间升序返回，依次 notify 后最新的在卡栈最上方
    for (const request of pending) {
      if (seen.has(request.id)) continue;
      seen.add(request.id);
      shown.add(request.id);
      showRequest(request, decide);
    }
  }, [requests, synced]);

  return null;
}

function showRequest(
  request: JoinRequest,
  decide: (id: string, approve: boolean) => Promise<unknown>
) {
  const title = useCollaborationStore
    .getState()
    .sessions.find(session => session.id === request.documentId)?.title;
  notify({
    id: noticeId(request.id),
    title: `${request.nickname}请求加入协作`,
    body: title ? `「${title}」` : "请求加入你的协作文档",
    source: "协作",
    avatar: request.nickname.trim().charAt(0) || "?",
    avatarSeed: request.deviceId,
    sticky: true,
    actions: [
      {
        label: "拒绝",
        resolvedText: `已拒绝${request.nickname}的申请`,
        onClick: () => decide(request.id, false),
      },
      {
        label: "同意",
        primary: true,
        resolvedText: `已同意${request.nickname}加入协作`,
        onClick: () => decide(request.id, true),
      },
    ],
  });
}
