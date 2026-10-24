import { useMemo, useRef, useState } from "react";
import { useMemoizedFn } from "ahooks";
import type { SettingCompat, SettingWriteResponse, SyncActionResponse } from "../types";
import * as tauri from "../services/tauri";
import { setMobileSettingSnapshot } from "../services/mobileSettingsBridge";

export function normalizeSetting(setting: SettingCompat): SettingCompat {
  const raw = setting as Partial<SettingCompat>;
  const database = (raw.database ?? {}) as Partial<SettingCompat["database"]>;
  const imageBed = (raw.imageBed ?? {}) as Partial<SettingCompat["imageBed"]>;
  const sync = (raw.sync ?? {}) as Partial<SettingCompat["sync"]>;
  const ttsUsageSettings = (raw.ttsUsageSettings ?? {}) as Partial<
    NonNullable<SettingCompat["ttsUsageSettings"]>
  >;
  const ttsDefault = ttsUsageSettings.default;
  const appearance = (raw.appearance ?? {}) as NonNullable<SettingCompat["appearance"]>;
  const rawImage = (appearance.image ?? {}) as {
    borderRadius?: unknown;
    shadow?: unknown;
  };
  const RADIUS_PRESETS = ["none", "sm", "md", "lg"];
  const SHADOW_PRESETS = ["none", "sm", "md", "lg"];
  const normalizeShadowPreset = (shadow: unknown) => {
    if (typeof shadow === "string" && SHADOW_PRESETS.includes(shadow)) return shadow;
    return "none";
  };
  const normalizeRadiusPreset = (radius: unknown) => {
    if (typeof radius === "string" && RADIUS_PRESETS.includes(radius)) return radius;
    return "none";
  };

  return {
    ...raw,
    ttsProviders: Array.isArray(raw.ttsProviders) ? raw.ttsProviders : [],
    ttsUsageSettings: {
      ...ttsUsageSettings,
      default:
        ttsDefault &&
        typeof ttsDefault.providerId === "string" &&
        typeof ttsDefault.modelId === "string" &&
        typeof ttsDefault.voiceId === "string"
          ? ttsDefault
          : null,
    },
    appearance: {
      ...appearance,
      image: {
        borderRadius: normalizeRadiusPreset(rawImage.borderRadius),
        shadow: normalizeShadowPreset(rawImage.shadow),
      },
    },
    database: {
      active: typeof database.active === "string" ? database.active : "data.db",
      databases: Array.isArray(database.databases) ? database.databases : [],
    },
    imageBed: {
      ...imageBed,
      active: typeof imageBed.active === "string" ? imageBed.active : "local",
      enableCompression:
        typeof imageBed.enableCompression === "boolean" ? imageBed.enableCompression : true,
      local: { path: typeof imageBed.local?.path === "string" ? imageBed.local.path : "resources" },
      plugin: imageBed.plugin ?? { id: "", configurations: {} },
    },
    sync: {
      ...sync,
      active: typeof sync.active === "string" ? sync.active : "plugin",
      plugin: sync.plugin ?? { id: "", configurations: {} },
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

  // 返回值 memo 化：字段不变时引用稳定（函数均经 useMemoizedFn 稳定）
  return useMemo(
    () => ({
      setting,
      safeSetting,
      isSavingSetting,
      isSyncing,
      setSetting,
      updateSetting,
      loadSetting,
      persistSetting,
      runSyncAction,
    }),
    [
      setting,
      safeSetting,
      isSavingSetting,
      isSyncing,
      setSetting,
      updateSetting,
      loadSetting,
      persistSetting,
      runSyncAction,
    ]
  );
}

export type { SettingWriteResponse };
