// 存在级事件登记表：onDestroy 由 Host 在 entry 离开栈时显式分发，
// 不受 <Activity hidden> 卸载 effect 的影响（那是"可见性"语义，见 usePageLifecycle）。
// 注册在组件渲染期幂等刷新（handler 每次拿最新 ref）；消费即删，LRU 逐出的残留条目无害。

type DestroyHandler = () => void;

const destroyHandlers = new Map<string, DestroyHandler>();

export function registerEntryDestroyHandler(entryId: string, handler: DestroyHandler): void {
  destroyHandlers.set(entryId, handler);
}

export function notifyEntriesRemoved(removedIds: ReadonlyArray<string>): void {
  for (const entryId of removedIds) {
    const handler = destroyHandlers.get(entryId);
    destroyHandlers.delete(entryId);
    handler?.();
  }
}
