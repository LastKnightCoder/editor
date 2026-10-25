// 会话状态推导与本机活动上报（两端共用的展示层推导，无 UI 框架依赖）。
// 此前移动端/桌面端各持一份手抄实现且已发生单端漂移（瞬时同步的 effect 依赖修复
// 只落在移动端），现收敛为唯一实现。
import { useEffect, useRef, useState } from "react";
import type { CollaborationSession } from "./protocol";

export type SessionTone = "live" | "syncing" | "offline" | "error" | "idle";

export type SessionStatus = {
  label: string;
  tone: SessionTone;
  /** 连接正常且有未同步改动：打字时 pending 在毫秒级反复翻转，展示层需延迟揭示 */
  transientSyncing?: boolean;
};

export function sessionStatus(session: CollaborationSession): SessionStatus {
  if (session.error) return { label: session.error, tone: "error" };
  if (session.leaving) return { label: "等待退出完成", tone: "syncing" };
  if (session.status === "closed") {
    return session.pending
      ? { label: "共享已结束，有待恢复内容", tone: "syncing" }
      : { label: "共享已结束", tone: "idle" };
  }
  if (session.connection === "connected") {
    // 唯一由打字触发的同步态（error/leaving/closed 分支的 syncing 都不是）：标记供展示层延迟揭示
    return session.pending
      ? { label: "正在同步", tone: "syncing", transientSyncing: true }
      : { label: "已同步", tone: "live" };
  }
  return session.pending
    ? { label: "离线，改动已存本机", tone: "syncing" }
    : { label: "离线", tone: "offline" };
}

export function sessionStatusLabel(session: CollaborationSession) {
  return sessionStatus(session).label;
}

/** 连接正常时的瞬时「正在同步」需持续超过该时长才切换显示，避免打字时徽标闪烁 */
const TRANSIENT_SYNCING_DELAY_MS = 1000;

export function useStableSessionStatus(session?: CollaborationSession): SessionStatus | undefined {
  return useStableStatus(session ? sessionStatus(session) : undefined);
}

/** 任意来源的状态（如白板同步）共用同一延迟揭示规则 */
export function useStableStatus<T extends SessionStatus>(status?: T): SessionStatus | undefined {
  const [displayed, setDisplayed] = useState<SessionStatus | undefined>(status);
  // 依赖只放可比较的原始字段：session 与推导结果的引用每次渲染/状态广播都会重建，
  // 一旦作为依赖，本 effect 就会每渲染重跑并反复重置计时器——广播比 1s 更密时揭示被无限推迟
  const label = status?.label;
  const tone = status?.tone;
  const transientSyncing = status?.transientSyncing === true;

  useEffect(() => {
    if (label === undefined || tone === undefined) {
      setDisplayed(undefined);
      return;
    }
    const reveal = () =>
      setDisplayed(previous =>
        previous?.label === label && previous?.tone === tone ? previous : { label, tone }
      );
    if (!transientSyncing) {
      reveal();
      return;
    }
    const timer = setTimeout(reveal, TRANSIENT_SYNCING_DELAY_MS);
    return () => clearTimeout(timer);
  }, [label, tone, transientSyncing]);

  return displayed ?? status;
}

/** presence 上报的目标：awareness 的最小结构（编辑器协作绑定的子集） */
interface PresenceTarget {
  awareness: { setLocalStateField: (field: string, value: unknown) => void };
}

/** 本机活动状态上报：写入 awareness 的 activity 字段，服务端白名单后聚合成房间级 presence */
export function useCollaborationPresence(binding: PresenceTarget | undefined, readonly: boolean) {
  const focused = useRef(false);
  // 监听只注册一次；回调经 ref 读最新的 binding/readonly，避免重复解绑/重绑
  const updateRef = useRef(() => {});
  updateRef.current = () => {
    binding?.awareness.setLocalStateField(
      "activity",
      document.visibilityState === "hidden"
        ? "background"
        : focused.current && document.hasFocus() && !readonly
          ? "editing"
          : "viewing"
    );
  };

  useEffect(() => {
    const update = () => updateRef.current();
    update();
    window.addEventListener("blur", update);
    window.addEventListener("focus", update);
    document.addEventListener("visibilitychange", update);
    return () => {
      window.removeEventListener("blur", update);
      window.removeEventListener("focus", update);
      document.removeEventListener("visibilitychange", update);
    };
  }, []);

  // binding 就绪 / readonly 翻转（如冻结解除）时主动重报一次，
  // 否则旧 activity 要等到下一次焦点或可见性事件才被纠正
  useEffect(() => {
    updateRef.current();
  }, [binding, readonly]);

  return {
    onFocus: () => {
      focused.current = true;
      updateRef.current();
    },
    onBlur: () => {
      focused.current = false;
      updateRef.current();
    },
  };
}
