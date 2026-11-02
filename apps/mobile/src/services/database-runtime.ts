import { invoke } from "@tauri-apps/api/core";
import { settleLibraryRequests } from "./ipc-requests";

let activeName = "";
const idle = { version: 0, active: false };
const replacements = new Map<string, typeof idle>();
const listeners = new Set<() => void>();

export const activeDatabase = () => activeName;
export const setActiveDatabase = (name: string) => {
  activeName = name;
};
export const databaseReplacementState = (name = activeName) => replacements.get(name) ?? idle;
export const subscribeDatabaseReplacement = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
export const databaseGeneration = (name = activeName) =>
  name ? invoke<string>("database_generation", { name }) : Promise.resolve("");

export function beginDatabaseReplacement(name = activeName) {
  if (databaseReplacementState(name).active) throw new Error("当前资料库正在替换");
  const update = (active: boolean) => {
    replacements.set(name, { version: databaseReplacementState(name).version + 1, active });
    for (const listener of listeners) listener();
  };
  update(true);
  return () => update(false);
}

export async function replaceLocalLibrary<T>(name: string, action: () => Promise<T>): Promise<T> {
  const finish = beginDatabaseReplacement(name);
  try {
    await settleLibraryRequests();
    return await action();
  } finally {
    finish();
  }
}
