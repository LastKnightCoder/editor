/**
 * 扩展自己的页面（笔记页、伴读库）共用：本机存储、经后台调 Tau、订阅后台写入的连接状态并跟随 Tau 主题。
 */
import { useEffect, useState } from "react";
import { applyThemeToDom } from "@tau/themes/dom";
import type { KeyValueStore } from "../background/connection";
import type { ConnectionStatus, ExtensionPageMessage, ExtensionPageReply } from "./messages";
import { STATUS_KEY } from "./note-storage";

export const extensionStorage: KeyValueStore = {
  async get<T>(key: string) {
    return (await chrome.storage.local.get(key))[key] as T | undefined;
  },
  set: (key, value) => chrome.storage.local.set({ [key]: value }),
  remove: key => chrome.storage.local.remove(key),
};

export async function callBackground<T>(method: string, params: unknown): Promise<T> {
  const reply = (await chrome.runtime.sendMessage({
    kind: "page-rpc",
    method,
    params,
  } satisfies ExtensionPageMessage)) as ExtensionPageReply | undefined;
  if (!reply) throw new Error("扩展后台没有响应");
  if (!reply.ok) throw new Error(reply.error);
  return reply.result as T;
}

const prefersDark = () => matchMedia("(prefers-color-scheme: dark)").matches;

/** 连接状态（后台写在 STATUS_KEY）；主题与明暗跟随 Tau，未连接时暖纸 + 系统明暗 */
export function useCompanionStatus(): ConnectionStatus {
  const [status, setStatus] = useState<ConnectionStatus>({ state: "unpaired" });

  useEffect(() => {
    void extensionStorage
      .get<ConnectionStatus>(STATUS_KEY)
      .then(value => value && setStatus(value));
    const onChanged = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      const next = area === "local" && (changes[STATUS_KEY]?.newValue as ConnectionStatus);
      if (next) setStatus(next);
    };
    chrome.storage.onChanged.addListener(onChanged);
    return () => chrome.storage.onChanged.removeListener(onChanged);
  }, []);

  useEffect(() => {
    const appearance = status.appearance;
    applyThemeToDom(
      appearance?.theme ?? "paper",
      appearance?.mode ?? (prefersDark() ? "dark" : "light")
    );
  }, [status.appearance]);

  return status;
}
