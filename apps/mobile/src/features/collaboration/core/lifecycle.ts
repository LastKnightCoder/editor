import * as rest from "./rest";
import { setCollaborationState } from "./store";
import type { CollaborationManager } from "./manager";
import { describeError } from "./utils";
import * as tauri from "../../../services/tauri";

/** 列表新鲜度主要靠 /events 推送，轮询只作兜底（桌面为 15s，移动端放宽省电） */
const REFRESH_INTERVAL_MS = 60_000;
/** 最后一个协作页面关闭且没有活跃会话后，运行时再保留的空闲窗口 */
const IDLE_STOP_DELAY_MS = 30_000;

/** 运行时持有计数（协作页面挂载 +1 / 卸载 -1）：归零且无活跃会话后延迟空闲停止 */
export function retain(manager: CollaborationManager) {
  manager.refCount += 1;
  if (manager.idleTimer) {
    clearTimeout(manager.idleTimer);
    manager.idleTimer = null;
  }
}

export function release(manager: CollaborationManager) {
  manager.refCount = Math.max(0, manager.refCount - 1);
  if (manager.refCount > 0 || manager.idleTimer) return;
  manager.idleTimer = setTimeout(() => {
    manager.idleTimer = null;
    // 有活跃会话或未同步改动时推迟停止，下一轮空闲检查再试
    if (
      manager.refCount > 0 ||
      manager.hasPendingUpdates() ||
      manager.sessions.size > 0 ||
      manager.hasPendingJoins()
    ) {
      manager.release();
      return;
    }
    manager.stop();
  }, IDLE_STOP_DELAY_MS);
}

export function hasPendingUpdates(manager: CollaborationManager) {
  for (const session of manager.sessions.values()) if (session.info.pending) return true;
  return false;
}

export function hasPendingJoins(manager: CollaborationManager) {
  const now = Date.now();
  for (const [documentId, expiresAt] of manager.pendingJoins) {
    if (expiresAt <= now) manager.pendingJoins.delete(documentId);
  }
  return manager.pendingJoins.size > 0;
}

/** 启动运行时（服务器固定为 DEFAULT_COLLABORATION_URL，与桌面端一致）；已启动时重复调用为幂等。
 *  昵称变更不触发重启——请用 updateNickname 同步，避免打断进行中的同步。 */
export function start(manager: CollaborationManager, options: { nickname: string }): Promise<void> {
  manager.desired = { nickname: options.nickname.trim() || "Tau 用户" };
  manager.starting ??= manager.runStartLoop();
  return manager.starting;
}

export function bindLifecycle(manager: CollaborationManager) {
  if (manager.lifecycleCleanup || typeof window === "undefined") return;
  const recover = () => {
    if (manager.stopped || document.visibilityState === "hidden") return;
    void manager.refresh();
    for (const session of manager.sessions.values()) {
      if (session.info.connection === "offline" || session.info.connection === "error")
        void manager.reconnect(session.info.id);
    }
  };
  window.addEventListener("online", recover);
  document.addEventListener("visibilitychange", recover);
  manager.lifecycleCleanup = () => {
    window.removeEventListener("online", recover);
    document.removeEventListener("visibilitychange", recover);
    manager.lifecycleCleanup = null;
  };
}
export async function runStartLoop(manager: CollaborationManager): Promise<void> {
  try {
    while (manager.desired) {
      // 取走式消费：await 期间收到的新目标（开关）由下一轮循环接续处理
      const target = manager.desired;
      manager.desired = null;
      if (manager.stopped) {
        manager.teardown();
        manager.nickname = target.nickname;
        manager.stopped = false;
        manager.bindLifecycle();
        setCollaborationState({
          serverUrl: manager.serverUrl,
          nickname: manager.nickname,
          status: "starting",
          error: undefined,
        });
        try {
          const identity = await rest.getIdentity(manager.serverUrl, manager.nickname);
          manager.deviceId = identity.id;
          await manager.refresh();
          if (manager.stopped) break; // 启动等待期被 stop：就此收手，不重建轮询
          manager.startPolling();
        } catch (failure) {
          manager.error = describeError(failure, "协作服务初始化失败");
          manager.stopped = true;
          manager.changed();
          throw failure;
        }
      }
    }
  } finally {
    manager.starting = null;
    // 循环退出（被 stop 打断/启动失败）时可能残留未被消费的新目标
    // （等待期内的 stop→start 交错）：接续启动，避免运行时静默停摆
    if (manager.desired) {
      const revived = manager.runStartLoop();
      // 该 promise 无直接调用方（原 start() 持有的是旧循环的 promise）：
      // 兜底吞掉 rejection 避免 unhandled rejection，新调用仍经 starting 复用
      revived.catch(() => {});
      manager.starting = revived;
    }
  }
}

export function stop(manager: CollaborationManager) {
  manager.desired = null;
  manager.lifecycleCleanup?.();
  manager.teardown();
  if (manager.idleTimer) {
    clearTimeout(manager.idleTimer);
    manager.idleTimer = null;
  }
  // stop 绕过 changed() 直写 store：同步失效广播摘要，避免重启后误判「无变化」跳过广播
  manager.broadcastSummary = "";
  setCollaborationState({ status: "idle", sessions: [], requests: [], error: undefined });
}

/** 等待进行中的启动完成：挂载即触发的操作（发起共享 / 打开文档）与运行时
 *  启动并发时避免用到未就绪的服务器配置；启动失败由后续请求自然报错。
 *  协作页面漏挂 runtime（防御）：按用户设置的昵称就地启动。 */
/** 读取 starting 的稳定通道：方法调用不做控制流收窄，await 之后仍能读到并发启动 */
export function pendingStart(manager: CollaborationManager): Promise<void> | null {
  return manager.starting;
}

export async function whenReady(manager: CollaborationManager) {
  if (!manager.starting && manager.stopped) {
    const nickname = await manager.readStoredNickname();
    // await 期间并发启动（页面挂载 runtime）时不重复启动
    const pending = manager.pendingStart();
    if (pending) return pending.catch(() => {});
    await manager.start({ nickname }).catch(() => {});
  }
  if (manager.starting) await manager.starting.catch(() => {});
}

export async function readStoredNickname(_manager: CollaborationManager): Promise<string> {
  try {
    const setting = JSON.parse(await tauri.readSettingJson()) as {
      collaboration?: { nickname?: string };
    };
    return setting.collaboration?.nickname || "Tau 用户";
  } catch {
    return "Tau 用户";
  }
}

export function startPolling(manager: CollaborationManager) {
  if (manager.refreshTimer) return;
  manager.refreshTimer = setInterval(() => {
    // 后台不轮询：WebView 挂起时连接自然断开，回前台由 refresh 补齐
    if (document.visibilityState === "hidden") return;
    void manager.refresh();
  }, REFRESH_INTERVAL_MS);
  manager.resourceTimer = setInterval(() => {
    if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
    for (const session of manager.sessions.values()) {
      if (
        session.info.status === "active" &&
        !session.info.leaving &&
        (session.assetsPending || session.resourcesDirty)
      )
        void manager.processResources(session).catch(() => {});
    }
  }, 2000);
}

export function teardown(manager: CollaborationManager) {
  manager.stopped = true;
  if (manager.resourceTimer) {
    clearInterval(manager.resourceTimer);
    manager.resourceTimer = null;
  }
  if (manager.refreshTimer) {
    clearInterval(manager.refreshTimer);
    manager.refreshTimer = null;
  }
  for (const socket of manager.eventSockets.values()) socket.close();
  manager.eventSockets.clear();
  for (const documentId of [...manager.sessions.keys()]) manager.disposeSession(documentId);
  for (const transport of manager.transports.values()) transport.destroy();
  manager.transports.clear();
  manager.rooms.clear();
  manager.requests = [];
  manager.pendingJoins.clear();
  manager.deviceId = undefined;
  manager.error = undefined;
}
