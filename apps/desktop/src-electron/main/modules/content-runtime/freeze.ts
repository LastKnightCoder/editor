import { randomUUID } from "node:crypto";
import type { RuntimeSession } from "../collaboration/types";
import type { ContentSessionRuntime } from "./index";

export function acknowledgeFreeze(
  runtime: ContentSessionRuntime,
  viewId: string,
  requestId?: string
) {
  const view = runtime.views.get(viewId);
  const session = view && runtime.sessions.get(view.documentId);
  const waiter = session && runtime.freezeWaiters.get(session.info.id);
  if (waiter ? waiter.id !== requestId : requestId !== undefined) return;
  if (!session?.drainingViews) return;
  session.drainingViews.delete(viewId);
  if (!session.drainingViews.size) waiter?.resolve();
}

export async function freeze(runtime: ContentSessionRuntime, session: RuntimeSession) {
  if (session.info.frozen) throw new Error("内容正在切换，请稍后重试");
  session.info.frozen = true;
  const requestId = randomUUID();
  session.drainingViews = new Set(
    [...runtime.views].filter(([, view]) => view.documentId === session.info.id).map(([id]) => id)
  );
  const drained = new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("有编辑窗口未完成保存，请稍后重试")), 10000);
    runtime.freezeWaiters.set(session.info.id, {
      id: requestId,
      resolve: () => {
        clearTimeout(timeout);
        resolve();
      },
    });
    if (!session.drainingViews?.size) runtime.freezeWaiters.get(session.info.id)?.resolve();
  });
  runtime.broadcast("collaboration:freeze", {
    documentId: session.info.id,
    frozen: true,
    requestId,
  });
  try {
    await drained;
  } catch (error) {
    // 视图未确认保存时恢复编辑：渲染端仍持有未送达的编辑，冻结不能悬空
    if (runtime.freezeWaiters.get(session.info.id)?.id === requestId) runtime.unfreeze(session);
    throw error;
  } finally {
    runtime.freezeWaiters.delete(session.info.id);
  }
}

export function unfreeze(runtime: ContentSessionRuntime, session: RuntimeSession) {
  session.info.frozen = false;
  session.drainingViews = undefined;
  runtime.broadcast("collaboration:freeze", { documentId: session.info.id, frozen: false });
}
