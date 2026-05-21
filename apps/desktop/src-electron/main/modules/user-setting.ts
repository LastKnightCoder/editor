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

class UserSettingModule {
  private backendServer: BackendWebSocketServer | null = null;
  private userSetting: UserSetting = {};
  private settingLoaded = false;
  private settingChangeListeners: Set<SettingChangedListener> = new Set();

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

  private notifySettingChanged(payload: SettingChangedPayload) {
    this.settingChangeListeners.forEach((listener) => {
      try {
        listener(payload);
      } catch (error) {
        console.error(
          "[UserSettingModule] onSettingChanged listener error:",
          error,
        );
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
    this.backendServer.addMessageHandler(
      "set-user-setting",
      async (message: RpcRequestMessage) => {
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
      },
    );

    this.backendServer.addMessageHandler(
      "get-user-setting",
      async (message: RpcRequestMessage) => {
        const { id, method } = message;
        const res: RpcResponseMessage = {
          type: RpcMessageType.Response,
          id,
          method,
          result: this.userSetting,
          error: null,
        };

        return res;
      },
    );
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
      console.error(e);
      return {};
    }
  }

  private async saveSetting(setting: string) {
    const appDir = PathUtil.getAppDir();
    const settingPath = join(appDir, "setting.json");
    const tempPath = join(appDir, "setting.json.tmp");
    await fs.writeFile(tempPath, setting, "utf-8");
    await fsExtra.move(tempPath, settingPath, { overwrite: true });
  }

  private getSettingDiff(
    oldSetting: UserSetting,
    newSetting: UserSetting,
  ): Partial<object> {
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
    params: object,
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
    connectionStatus:
      typeof weread.connectionStatus === "string"
        ? weread.connectionStatus
        : "",
    lastValidatedAt:
      typeof weread.lastValidatedAt === "number" ? weread.lastValidatedAt : 0,
  };
};

export default new UserSettingModule();
