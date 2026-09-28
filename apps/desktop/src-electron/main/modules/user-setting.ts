import { RpcMessageType, RpcRequestMessage, RpcResponseMessage } from "@/types";
import BackendWebSocketServer from "../utils/BackendWebSocketServer";
import PathUtil from "../utils/PathUtil";
import isEqual from "lodash/isEqual";
import fs from "node:fs/promises";
import fsExtra from "fs-extra/esm";
import { join } from "node:path";

type UserSetting = Record<string, any>;
export interface SettingChangedPayload {
  oldSetting: UserSetting;
  newSetting: UserSetting;
}

type SettingChangedListener = (payload: SettingChangedPayload) => void;

/**
 * 从「完整 JSON + 尾部残留」的文件里取出开头那个完整对象（并发写截断的典型形态：
 * 较短的新内容覆盖较长的旧内容，旧内容尾巴留在后面）。取不到返回 null。
 */
export const salvageLeadingJsonObject = (raw: string): Record<string, any> | null => {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = 0; index < raw.length; index += 1) {
    const char = raw[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') {
      inString = true;
      continue;
    }
    if (char === "{" || char === "[") depth += 1;
    else if (char === "}" || char === "]") {
      depth -= 1;
      if (depth === 0) {
        try {
          const parsed = JSON.parse(raw.slice(0, index + 1));
          return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
        } catch {
          return null;
        }
      }
    }
  }
  return null;
};

class UserSettingModule {
  private backendServer: BackendWebSocketServer | null = null;
  private userSetting: UserSetting = {};
  private settingLoaded = false;
  private settingChangeListeners: Set<SettingChangedListener> = new Set();
  /** 落盘串行链：并发写会互相截断文件（见 saveSetting） */
  private savingChain: Promise<void> = Promise.resolve();
  private saveSequence = 0;

  onSettingChanged(listener: SettingChangedListener): () => void {
    this.settingChangeListeners.add(listener);
    return () => {
      this.settingChangeListeners.delete(listener);
    };
  }

  async getSettingSnapshot(): Promise<UserSetting> {
    await this.ensureSettingLoaded();
    return { ...this.userSetting };
  }

  async updateSyncVersion(name: string, version: number): Promise<void> {
    await this.ensureSettingLoaded();
    const database = this.userSetting.database;
    const rows = database?.databases as Array<{ name: string; version: number }> | undefined;
    if (!rows?.some(row => row.name === name)) throw new Error("数据库已从设置中移除");
    this.handleSetUserSetting({
      ...this.userSetting,
      database: {
        ...database,
        databases: rows.map(row => (row.name === name ? { ...row, version } : row)),
      },
    });
    await this.savingChain;
  }

  private notifySettingChanged(payload: SettingChangedPayload) {
    this.settingChangeListeners.forEach(listener => {
      try {
        listener(payload);
      } catch (error) {
        console.error("[UserSettingModule] onSettingChanged listener error:", error);
      }
    });
  }

  private async ensureSettingLoaded() {
    if (this.settingLoaded) {
      return this.userSetting;
    }
    this.userSetting = await this.loadSetting();
    this.settingLoaded = true;
    return this.userSetting;
  }

  async init(backendServer: BackendWebSocketServer) {
    this.backendServer = backendServer;
    await this.ensureSettingLoaded();
    this.backendServer.addMessageHandler("set-user-setting", async (message: RpcRequestMessage) => {
      const { id, method } = message;
      const params = message.params as unknown;

      if (params && typeof params === "object") {
        let clientId: string | undefined;
        let payloadSetting: UserSetting | null = null;

        if (this.isSetUserSettingPayload(params)) {
          payloadSetting = params.setting;
          clientId = params.clientId;
        } else {
          payloadSetting = params as UserSetting;
        }

        if (payloadSetting) {
          this.handleSetUserSetting(payloadSetting, clientId);
        }
      }

      const res: RpcResponseMessage = {
        type: RpcMessageType.Response,
        id,
        method,
        result: { Ok: true },
        error: null,
      };

      return res;
    });

    this.backendServer.addMessageHandler("get-user-setting", async (message: RpcRequestMessage) => {
      const { id, method } = message;
      const res: RpcResponseMessage = {
        type: RpcMessageType.Response,
        id,
        method,
        result: this.userSetting,
        error: null,
      };

      return res;
    });
  }

  handleSetUserSetting(newSettings: UserSetting, clientId?: string) {
    const settings = this.userSetting;
    this.userSetting = newSettings;
    const changed = this.getSettingDiff(settings, newSettings);
    if (Object.keys(changed).length === 0) {
      return;
    }

    console.info("[UserSettingModule] 保存用户设置", {
      clientId: clientId || "unknown",
      weread: summarizeWeReadSetting(newSettings),
    });
    this.saveSetting(JSON.stringify(newSettings, null, 2));
    if (this.backendServer) {
      this.backendServer.sendNotification("user-setting-changed", {
        setting: newSettings,
        clientId,
      });
    }
    this.notifySettingChanged({
      oldSetting: settings,
      newSetting: newSettings,
    });
  }

  private async loadSetting() {
    const appDir = PathUtil.getAppDir();
    const settingPath = join(appDir, "setting.json");
    if (!(await fsExtra.pathExists(settingPath))) {
      await this.saveSetting("{}");
    }
    const setting = await fs.readFile(settingPath, "utf-8");
    try {
      const parsedSetting = JSON.parse(setting);
      this.userSetting = parsedSetting;
      console.info("[UserSettingModule] 读取用户设置", {
        weread: summarizeWeReadSetting(parsedSetting),
      });
      return parsedSetting;
    } catch (e) {
      console.error("[UserSettingModule] 设置文件解析失败，尝试抢救", e);
      // 直接返回 {} 会让下一次保存把默认值写回去，等于静默清空用户全部设置：
      // 先留一份原始损坏文件，再尝试取出开头的完整 JSON 文档（并发写残留的典型形态）
      const backupPath = join(appDir, `setting.json.corrupt-${Date.now()}.bak`);
      await fs.writeFile(backupPath, setting, "utf-8").catch(error => {
        console.error("[UserSettingModule] 备份损坏设置失败", error);
      });
      const salvaged = salvageLeadingJsonObject(setting);
      if (salvaged) {
        console.info("[UserSettingModule] 已从损坏文件抢救设置", {
          backupPath,
          keys: Object.keys(salvaged).length,
        });
        this.userSetting = salvaged;
        await this.saveSetting(JSON.stringify(salvaged, null, 2)).catch(() => undefined);
        return salvaged;
      }
      console.error("[UserSettingModule] 无法抢救设置文件，已保留备份", { backupPath });
      return {};
    }
  }

  /**
   * 落盘设置。**必须串行 + 独占临时文件**：多窗口同时改设置时，共用固定 tmp 路径的并发写会
   * 互相截断（较短的新内容覆盖较长的旧内容后留下旧尾巴），产出无法解析的 setting.json，
   * 并伴随大量 rename ENOENT（前一次已把 tmp 移走）。事故记录见交接文档坑 16。
   */
  private async saveSetting(setting: string) {
    this.savingChain = this.savingChain
      .catch(() => undefined)
      .then(() => this.writeSettingFile(setting));
    return this.savingChain;
  }

  private async writeSettingFile(setting: string) {
    const appDir = PathUtil.getAppDir();
    const settingPath = join(appDir, "setting.json");
    // 独占临时名：即便有别的进程/历史遗留在写，也不会共用同一个 tmp
    const tempPath = join(appDir, `setting.json.${process.pid}.${++this.saveSequence}.tmp`);
    try {
      await fs.writeFile(tempPath, setting, "utf-8");
      await fsExtra.move(tempPath, settingPath, { overwrite: true });
    } catch (error) {
      await fs.rm(tempPath, { force: true }).catch(() => undefined);
      console.error("[UserSettingModule] 保存用户设置失败", error);
      throw error;
    }
  }

  private getSettingDiff(oldSetting: UserSetting, newSetting: UserSetting): Partial<object> {
    const diff: Partial<UserSetting> = {};
    let hasChanges = false;

    for (const key in newSetting) {
      if (Object.prototype.hasOwnProperty.call(newSetting, key)) {
        const oldValue = oldSetting[key];
        const newValue = newSetting[key];

        if (!isEqual(oldValue, newValue)) {
          diff[key] = newValue;
          hasChanges = true;
        }
      }
    }

    return hasChanges ? diff : {};
  }

  private isSetUserSettingPayload(
    params: object
  ): params is { setting: UserSetting; clientId?: string } {
    return Object.prototype.hasOwnProperty.call(params, "setting");
  }
}

const summarizeWeReadSetting = (setting: UserSetting) => {
  const weread = setting?.integration?.weread;
  if (!weread || typeof weread !== "object") {
    return null;
  }
  return {
    enabled: Boolean(weread.enabled),
    hasApiKey: typeof weread.apiKey === "string" && weread.apiKey.length > 0,
    connectionStatus: typeof weread.connectionStatus === "string" ? weread.connectionStatus : "",
    lastValidatedAt: typeof weread.lastValidatedAt === "number" ? weread.lastValidatedAt : 0,
  };
};

export default new UserSettingModule();
