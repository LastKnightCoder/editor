import { NODE_DOCUMENT_VERSION } from "@tau/collaboration";
import { setCollaborationState } from "./store";
import type { CollaborationManager } from "./manager";

/** 状态广播：sessions 元素浅拷贝（切断与内部对象的引用共享，订阅方可安全做相等比较），
 *  且仅在摘要变化时真正写入 store——同步回调可能在打字时毫秒级触发，绝大多数广播
 *  不产生新状态，直接写 store 会让所有订阅组件无谓重渲染。 */
export function changed(manager: CollaborationManager) {
  // 启动失败时 stopped 与 error 同时成立，须先判 error，否则失败会显示成「未启用」；
  // 主动 stop 经 teardown 清空 error，仍落到 idle
  const status = manager.error ? "error" : manager.stopped ? "idle" : "ready";
  const sessions = [...manager.sessions.values()].map(session => ({ ...session.info }));
  for (const room of manager.rooms.values()) {
    if (
      room.kind !== "content" ||
      room.protocolVersion !== NODE_DOCUMENT_VERSION ||
      manager.sessions.has(room.id)
    )
      continue;
    sessions.push({
      ...room,
      serverUrl: manager.serverUrl,
      mode: "shared",
      connection: "idle",
      pending: false,
      leaving: false,
    });
  }
  sessions.sort((a, b) => b.updatedAt - a.updatedAt);
  const summary = JSON.stringify([
    manager.serverUrl,
    manager.nickname,
    manager.deviceId,
    sessions,
    manager.requests,
    manager.error,
    status,
  ]);
  if (summary === manager.broadcastSummary) return;
  manager.broadcastSummary = summary;
  setCollaborationState({
    serverUrl: manager.serverUrl,
    nickname: manager.nickname,
    deviceId: manager.deviceId,
    sessions,
    requests: manager.requests,
    error: manager.error,
    status,
  });
}
