import Database from "better-sqlite3";
import type { WorkspacePreferences } from "@/types/workspace-preferences";

export const FEATURE_ONBOARDING_KEY = "features.onboarding";
const FEATURES_DISABLED_KEY = "features.disabled";
const MAX_DISABLED = 200;

/** 工作区偏好：随工作区保存的界面设置，整份读、按项写 */
export default class WorkspacePreferencesTable {
  static getListenEvents() {
    return {
      "workspace-preferences:get": this.get.bind(this),
      "workspace-preferences:save": this.save.bind(this),
    };
  }

  static get(db: Database.Database): WorkspacePreferences {
    const rows = db
      .prepare("SELECT key, value FROM workspace_preferences WHERE key IN (?, ?)")
      .all(FEATURES_DISABLED_KEY, FEATURE_ONBOARDING_KEY) as { key: string; value: string }[];
    const values = new Map(rows.map(row => [row.key, row.value]));
    return {
      disabledFeatures: parseDisabled(values.get(FEATURES_DISABLED_KEY)),
      onboarding: values.get(FEATURE_ONBOARDING_KEY) === "pending" ? "pending" : "done",
    };
  }

  static save(db: Database.Database, patch: Partial<WorkspacePreferences>): WorkspacePreferences {
    const writes: [string, string][] = [];
    if (patch.disabledFeatures !== undefined) {
      const list = patch.disabledFeatures;
      if (
        !Array.isArray(list) ||
        list.length > MAX_DISABLED ||
        list.some(id => typeof id !== "string" || !id || id.length > 128)
      )
        throw new Error("功能清单无效");
      writes.push([FEATURES_DISABLED_KEY, JSON.stringify([...new Set(list)])]);
    }
    if (patch.onboarding !== undefined) {
      if (patch.onboarding !== "pending" && patch.onboarding !== "done")
        throw new Error("引导状态无效");
      writes.push([FEATURE_ONBOARDING_KEY, patch.onboarding]);
    }
    const upsert = db.prepare(
      "INSERT INTO workspace_preferences (key, value, update_time) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, update_time = excluded.update_time"
    );
    const now = Date.now();
    db.transaction(() => {
      for (const [key, value] of writes) upsert.run(key, value, now);
    })();
    return this.get(db);
  }
}

function parseDisabled(raw: string | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
}
