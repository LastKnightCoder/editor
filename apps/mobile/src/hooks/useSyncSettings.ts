import { useMemo, useState } from "react";
import { useMemoizedFn } from "ahooks";
import type {
  SettingCompat,
  SettingWriteResponse,
  SyncActionResponse,
} from "../types";
import * as tauri from "../services/tauri";

function normalizeSetting(setting: SettingCompat): SettingCompat {
  const raw = setting as Partial<SettingCompat>;
  const database = (raw.database ?? {}) as Partial<SettingCompat["database"]>;
  const sync = (raw.sync ?? {}) as Partial<SettingCompat["sync"]>;
  const integration = (raw.integration ?? {}) as Partial<
    SettingCompat["integration"]
  >;

  return {
    ...raw,
    database: {
      active: typeof database.active === "string" ? database.active : "data.db",
      databases: Array.isArray(database.databases) ? database.databases : [],
    },
    sync: {
      ...sync,
      active: typeof sync.active === "string" ? sync.active : "aliOSS",
      webdav: {
        pathPrefix:
          typeof sync.webdav?.pathPrefix === "string"
            ? sync.webdav.pathPrefix
            : "",
      },
      aliOSS: {
        bucket:
          typeof sync.aliOSS?.bucket === "string" ? sync.aliOSS.bucket : "",
        region:
          typeof sync.aliOSS?.region === "string" ? sync.aliOSS.region : "",
        path: typeof sync.aliOSS?.path === "string" ? sync.aliOSS.path : "/",
      },
    },
    integration: {
      ...integration,
      webdav: {
        url:
          typeof integration.webdav?.url === "string"
            ? integration.webdav.url
            : "",
        username:
          typeof integration.webdav?.username === "string"
            ? integration.webdav.username
            : "",
        password:
          typeof integration.webdav?.password === "string"
            ? integration.webdav.password
            : "",
      },
      aliOSS: {
        accessKeyId:
          typeof integration.aliOSS?.accessKeyId === "string"
            ? integration.aliOSS.accessKeyId
            : "",
        accessKeySecret:
          typeof integration.aliOSS?.accessKeySecret === "string"
            ? integration.aliOSS.accessKeySecret
            : "",
      },
    },
  } as SettingCompat;
}

export function useSyncSettings() {
  const [setting, setSetting] = useState<SettingCompat | null>(null);
  const [isSavingSetting, setIsSavingSetting] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  const safeSetting = useMemo(
    () => (setting ? normalizeSetting(setting) : null),
    [setting],
  );

  const loadSetting = useMemoizedFn(async () => {
    const raw = await tauri.readSettingJson();
    const parsed = JSON.parse(raw) as SettingCompat;
    const normalized = normalizeSetting(parsed);
    setSetting(normalized);
    return normalized;
  });

  const updateSetting = useMemoizedFn(
    (updater: (prev: SettingCompat) => SettingCompat) => {
      setSetting((prev) => {
        if (!prev) return prev;
        return normalizeSetting(updater(normalizeSetting(prev)));
      });
    },
  );

  const persistSetting = useMemoizedFn(async () => {
    if (!safeSetting) {
      throw new Error("SETTING_INVALID: setting 未初始化");
    }
    setIsSavingSetting(true);
    try {
      const payload = JSON.stringify(safeSetting);
      const result = await tauri.writeSettingJson(payload);
      if (!result.ok) {
        throw new Error(
          `${result.code ?? "SETTING_INVALID"}:${result.message}`,
        );
      }
      await loadSetting();
      return result;
    } finally {
      setIsSavingSetting(false);
    }
  });

  const runSyncAction = useMemoizedFn(
    async (command: "syncUploadDatabase" | "syncDownloadDatabase") => {
      setIsSyncing(true);
      try {
        const result: SyncActionResponse =
          command === "syncUploadDatabase"
            ? await tauri.syncUploadDatabase()
            : await tauri.syncDownloadDatabase();
        if (!result.ok) {
          const fallbackCode =
            command === "syncUploadDatabase"
              ? "SYNC_UPLOAD_FAILED"
              : "SYNC_DOWNLOAD_FAILED";
          throw new Error(`${result.code ?? fallbackCode}:${result.message}`);
        }
        return result;
      } finally {
        setIsSyncing(false);
      }
    },
  );

  return {
    setting,
    safeSetting,
    isSavingSetting,
    isSyncing,
    setSetting,
    updateSetting,
    loadSetting,
    persistSetting,
    runSyncAction,
  };
}

export type { SettingWriteResponse };
