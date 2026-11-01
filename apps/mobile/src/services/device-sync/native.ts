import { invoke } from "@tauri-apps/api/core";
import type {
  DeviceCommit,
  DeviceDocument,
  DeviceView,
  DeviceState,
} from "@tau/collaboration/src/device-sync/protocol";
import { prepareDeviceDocument } from "@tau/collaboration/src/device-sync/documents";
import { drainWithinBudget } from "../ipc-requests";
let activeName = "";
const idleReplacement = { version: 0, active: false };
const replacements = new Map<string, typeof idleReplacement>();
const replacementListeners = new Set<() => void>();
export const deviceReplacementState = (name = activeName) =>
  replacements.get(name) ?? idleReplacement;
export const subscribeDeviceReplacement = (listener: () => void) => {
  replacementListeners.add(listener);
  return () => {
    replacementListeners.delete(listener);
  };
};
export function beginDeviceReplacement(name = activeName) {
  if (deviceReplacementState(name).active) throw new Error("DEVICE_SYNC_REPLACING: 当前库正在恢复");
  const update = (active: boolean) => {
    replacements.set(name, { version: deviceReplacementState(name).version + 1, active });
    for (const listener of replacementListeners) listener();
  };
  update(true);
  return () => update(false);
}
const writes = new Map<string, Set<Promise<unknown>>>();
export async function settleDeviceWrites(name = activeName) {
  if (writes.get(name)?.size) await drainWithinBudget(Promise.allSettled([...writes.get(name)!]));
}
export const setDeviceSyncDatabase = (name: string) => {
  activeName = name;
};
export const deviceSyncDatabase = () => activeName;
export function deviceStore<T>(
  action: string,
  payload: unknown = {},
  name = activeName
): Promise<T> {
  if (!name) return Promise.reject(new Error("DEVICE_SYNC_LIBRARY: 资料库尚未就绪"));
  if (
    deviceReplacementState(name).active &&
    (action === "save-document" || (action === "commit" && !(payload as DeviceCommit).replaceLocal))
  )
    return Promise.reject(new Error("DEVICE_SYNC_REPLACED: 当前库正在恢复"));
  const task = invoke<T>("device_sync_store", { name, action, payload });
  if (action === "save-document" || action === "commit") {
    const pending = writes.get(name) ?? new Set();
    pending.add(task);
    writes.set(name, pending);
    void task
      .finally(() => {
        pending.delete(task);
        if (!pending.size) writes.delete(name);
      })
      .catch(() => {});
  }
  return task;
}
export const nativeDeviceStorage = (name: string) => ({
  replacementBase: (remote: DeviceState, sourceSequence: number) =>
    deviceStore<Pick<DeviceView, "state" | "sequence" | "generation">>(
      "replacement-base",
      { remote, sourceSequence },
      name
    ),
  read: (snapshot = false) => deviceStore<DeviceView>("read", { snapshot }, name),
  commit: async (plan: DeviceCommit) => {
    await deviceStore("commit", plan, name);
  },
  loadDocuments: (ids: number[]) => deviceStore<DeviceDocument[]>("documents", { ids }, name),
});
export const readRawDeviceContent = (contentId: number, name = activeName) =>
  name
    ? deviceStore<DeviceDocument | null>("document", { contentId }, name)
    : Promise.resolve(null);
export const readDeviceContent = async (contentId: number, name = activeName) => {
  if (!name) return null;
  try {
    await (await import("./content")).resolveDeviceJsonIntents(contentId, name);
    const entry = await readRawDeviceContent(contentId, name);
    if (entry) await prepareDeviceDocument(entry);
    return entry;
  } catch (error) {
    if (
      /DEVICE_SYNC_RETRY|CONTENT_(REVISION|SOURCE)_CONFLICT|资料库已切换|SQLITE_(BUSY|LOCKED|FULL|READONLY|IOERR)|database is locked|disk is full|readonly database/i.test(
        String(error)
      )
    )
      throw error;
    await deviceStore("recover", { contentId }, name);
    return null;
  }
};
export const deviceAsset = <T>(action: string, payload: unknown) =>
  invoke<T>("device_sync_asset", { action, payload });
export const deviceRequest = <T>(kind: string, payload: unknown) =>
  invoke<T>("device_sync_request", { kind, payload });

const listeners = new Set<() => void>();
export const wakeDeviceSync = () => {
  for (const listener of listeners) listener();
};
export const subscribeDeviceSyncWake = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
