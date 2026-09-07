import { useMemo, useRef, useState } from "react";
import { useMemoizedFn } from "ahooks";
import type { SettingCompat, SettingWriteResponse, SyncActionResponse } from "../types";
import * as tauri from "../services/tauri";
import { setMobileSettingSnapshot } from "../services/mobileSettingsBridge";

function normalizeSetting(setting: SettingCompat): SettingCompat {
  const raw = setting as Partial<SettingCompat>;
  const database = (raw.database ?? {}) as Partial<SettingCompat["database"]>;
  const imageBed = (raw.imageBed ?? {}) as Partial<SettingCompat["imageBed"]>;
  const sync = (raw.sync ?? {}) as Partial<SettingCompat["sync"]>;
  const integration = (raw.integration ?? {}) as Partial<SettingCompat["integration"]>;

  return {
    ...raw,
    database: {
      active: typeof database.active === "string" ? database.active : "data.db",
      databases: Array.isArray(database.databases) ? database.databases : [],
    },
    imageBed: {
      ...imageBed,
      active: typeof imageBed.active === "string" ? imageBed.active : "github",
      enableCompression:
        typeof imageBed.enableCompression === "boolean" ? imageBed.enableCompression : false,
      github: {
        repo: typeof imageBed.github?.repo === "string" ? imageBed.github.repo : "",
        branch: typeof imageBed.github?.branch === "string" ? imageBed.github.branch : "",
        cdn: typeof imageBed.github?.cdn === "string" ? imageBed.github.cdn : null,
        pathPrefix:
          typeof imageBed.github?.pathPrefix === "string" ? imageBed.github.pathPrefix : "",
      },
      aliOSS: {
        bucket: typeof imageBed.aliOSS?.bucket === "string" ? imageBed.aliOSS.bucket : "",
        region: typeof imageBed.aliOSS?.region === "string" ? imageBed.aliOSS.region : "",
        pathPrefix:
          typeof imageBed.aliOSS?.pathPrefix === "string" ? imageBed.aliOSS.pathPrefix : "",
      },
      local: {
        path: typeof imageBed.local?.path === "string" ? imageBed.local.path : "resources",
      },
      s3: {
        bucket: typeof imageBed.s3?.bucket === "string" ? imageBed.s3.bucket : "",
        region: typeof imageBed.s3?.region === "string" ? imageBed.s3.region : "",
        pathPrefix: typeof imageBed.s3?.pathPrefix === "string" ? imageBed.s3.pathPrefix : "",
      },
      webdav: {
        pathPrefix:
          typeof imageBed.webdav?.pathPrefix === "string" ? imageBed.webdav.pathPrefix : "",
      },
    },
    sync: {
      ...sync,
      active: typeof sync.active === "string" ? sync.active : "aliOSS",
      webdav: {
        pathPrefix: typeof sync.webdav?.pathPrefix === "string" ? sync.webdav.pathPrefix : "",
      },
      aliOSS: {
        bucket: typeof sync.aliOSS?.bucket === "string" ? sync.aliOSS.bucket : "",
        region: typeof sync.aliOSS?.region === "string" ? sync.aliOSS.region : "",
        path: typeof sync.aliOSS?.path === "string" ? sync.aliOSS.path : "/",
      },
      s3: {
        bucket: typeof sync.s3?.bucket === "string" ? sync.s3.bucket : "",
        region: typeof sync.s3?.region === "string" ? sync.s3.region : "",
        pathPrefix: typeof sync.s3?.pathPrefix === "string" ? sync.s3.pathPrefix : "",
      },
      github: {
        repo: typeof sync.github?.repo === "string" ? sync.github.repo : "",
        branch: typeof sync.github?.branch === "string" ? sync.github.branch : "",
        pathPrefix: typeof sync.github?.pathPrefix === "string" ? sync.github.pathPrefix : "",
      },
    },
    integration: {
      ...integration,
      github: {
        token: typeof integration.github?.token === "string" ? integration.github.token : "",
        user: {
          name:
            typeof integration.github?.user?.name === "string" ? integration.github.user.name : "",
          email:
            typeof integration.github?.user?.email === "string"
              ? integration.github.user.email
              : "",
        },
      },
      s3: {
        accessKeyId:
          typeof integration.s3?.accessKeyId === "string" ? integration.s3.accessKeyId : "",
        secretAccessKey:
          typeof integration.s3?.secretAccessKey === "string" ? integration.s3.secretAccessKey : "",
        endpoint: typeof integration.s3?.endpoint === "string" ? integration.s3.endpoint : "",
        urlStyle: integration.s3?.urlStyle === "virtualHosted" ? "virtualHosted" : "path",
      },
      webdav: {
        url: typeof integration.webdav?.url === "string" ? integration.webdav.url : "",
        username:
          typeof integration.webdav?.username === "string" ? integration.webdav.username : "",
        password:
          typeof integration.webdav?.password === "string" ? integration.webdav.password : "",
      },
      aliOSS: {
        accessKeyId:
          typeof integration.aliOSS?.accessKeyId === "string" ? integration.aliOSS.accessKeyId : "",
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
  const settingRef = useRef<SettingCompat | null>(null);
  const persistQueueRef = useRef<Promise<SettingWriteResponse | null>>(Promise.resolve(null));

  const safeSetting = useMemo(() => (setting ? normalizeSetting(setting) : null), [setting]);

  const loadSetting = useMemoizedFn(async () => {
    const raw = await tauri.readSettingJson();
    const parsed = JSON.parse(raw) as SettingCompat;
    const normalized = normalizeSetting(parsed);
    settingRef.current = normalized;
    setSetting(normalized);
    setMobileSettingSnapshot(normalized);
    return normalized;
  });

  const enqueuePersistSetting = useMemoizedFn(async (next: SettingCompat) => {
    const snapshot = normalizeSetting(next);
    const queued = persistQueueRef.current
      .catch(() => null)
      .then(async () => {
        setIsSavingSetting(true);
        try {
          const payload = JSON.stringify(snapshot);
          const result = await tauri.writeSettingJson(payload);
          if (!result.ok) {
            throw new Error(`${result.code ?? "SETTING_INVALID"}:${result.message}`);
          }
          return result;
        } finally {
          setIsSavingSetting(false);
        }
      });
    persistQueueRef.current = queued;
    return queued;
  });

  const updateSetting = useMemoizedFn(
    (updater: (prev: SettingCompat) => SettingCompat, options?: { persist?: boolean }) => {
      const current = settingRef.current;
      if (!current) return;
      const next = normalizeSetting(updater(current));
      settingRef.current = next;
      setSetting(next);
      setMobileSettingSnapshot(next);
      if (options?.persist) {
        void enqueuePersistSetting(next).catch(error => {
          console.error("[sync-settings] 自动保存失败:", error);
        });
      }
    }
  );

  const persistSetting = useMemoizedFn(async () => {
    const current = settingRef.current;
    if (!current) {
      throw new Error("SETTING_INVALID: setting 未初始化");
    }
    const result = await enqueuePersistSetting(current);
    if (!result) {
      throw new Error("SETTING_INVALID: 配置保存结果为空");
    }
    await loadSetting();
    return result;
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
            command === "syncUploadDatabase" ? "SYNC_UPLOAD_FAILED" : "SYNC_DOWNLOAD_FAILED";
          throw new Error(`${result.code ?? fallbackCode}:${result.message}`);
        }
        return result;
      } finally {
        setIsSyncing(false);
      }
    }
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
