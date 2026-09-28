/**
 * 宿主会话的生命周期策略（M4-e）：electron-free 的纯判定，由 pi-session-host 调用。
 *
 * - **忙**：在跑（流式/压缩）或有待用户处理的交互（审批/提问）。忙的会话任何时候都不回收、不顶替——
 *   后台运行（切页后回答继续跑、等待作答可以持续任意久）是 M2-f 以来的硬约束。
 * - **同一文件只能有一个宿主**：两个 SessionManager 同时写一个会话文件会互相覆盖。新建时发现已有
 *   宿主开着同一个文件：空闲的顶替（先释放旧的），忙的拒绝新建。
 *   典型来源：渲染层重载后渲染端的会话表清空，下一次发送不经收养直接新建。
 * - **空闲回收**：空闲超过阈值的释放（用户裁决 30 分钟）。代价是「本会话始终允许」的工具授权一起失效，
 *   与应用重启同一边界；下次发送从会话文件恢复。
 */

export const IDLE_DISPOSE_MS = 30 * 60 * 1000;
export const IDLE_SWEEP_INTERVAL_MS = 60 * 1000;

export interface HostedSessionState {
  id: string;
  file: string | undefined;
  busy: boolean;
  /** 最近一次活动（创建、prompt/steer、事件、交互变化）的时间 */
  lastActive: number;
}

/** 新建会话前：同一文件上已有的宿主怎么处理 */
export function resolveFileConflict(
  existing: HostedSessionState[],
  file: string | undefined
): { dispose: string[] } | { reject: string } {
  if (!file) return { dispose: [] };
  const same = existing.filter(session => session.file === file);
  if (same.some(session => session.busy)) {
    return { reject: "这个对话正在另一处运行，请等它结束或先停止" };
  }
  return { dispose: same.map(session => session.id) };
}

/** 空闲回收：返回应释放的会话 id */
export function idleSessionsToDispose(
  sessions: HostedSessionState[],
  now: number,
  idleMs = IDLE_DISPOSE_MS
): string[] {
  return sessions
    .filter(session => !session.busy && now - session.lastActive >= idleMs)
    .map(session => session.id);
}

const isInsideDir = (file: string, dir: string) => {
  const normalized = dir.replace(/[\\/]+$/, "");
  return file.startsWith(`${normalized}/`) || file.startsWith(`${normalized}\\`);
};

/**
 * 切库：释放**其他库**会话目录里的空闲会话（切到新库后不会再被用到；忙的留着，跑完后由空闲回收兜底）。
 * 只动应用对话根目录（`sessions/`）下的——浏览器扩展会话在 `browser-sessions/`，与库无关。
 * 按目录分隔符比较，`sessions/data` 不会误伤 `sessions/data2`。
 */
export function idleSessionsOfOtherLibraries(
  sessions: HostedSessionState[],
  sessionsRoot: string,
  currentLibraryDir: string
): string[] {
  return sessions
    .filter(
      session =>
        !session.busy &&
        session.file !== undefined &&
        isInsideDir(session.file, sessionsRoot) &&
        !isInsideDir(session.file, currentLibraryDir)
    )
    .map(session => session.id);
}
