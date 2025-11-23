import { RpcMessageType, RpcRequestMessage, RpcResponseMessage } from "@/types";
import BackendWebSocketServer from "../utils/BackendWebSocketServer";
import PathUtil from "../utils/PathUtil";
import isEqual from "lodash/isEqual";
import fs from "node:fs/promises";
import fsExtra from "fs-extra/esm";
import { join } from "node:path";

type UserSetting = Record<string, any>;

class UserSettingModule {
  private backendServer: BackendWebSocketServer | null = null;
  private userSetting: UserSetting = {};
  async init(backendServer: BackendWebSocketServer) {
    this.backendServer = backendServer;
    this.userSetting = await this.loadSetting();
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

    this.saveSetting(JSON.stringify(newSettings, null, 2));
    if (this.backendServer) {
      this.backendServer.sendNotification("user-setting-changed", {
        setting: newSettings,
        clientId,
      });
    }
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
      return parsedSetting;
    } catch (e) {
      console.error(e);
      return {};
    }
  }

  private saveSetting(setting: string) {
    const appDir = PathUtil.getAppDir();
    return fs.writeFile(join(appDir, "setting.json"), setting, "utf-8");
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

export default new UserSettingModule();
