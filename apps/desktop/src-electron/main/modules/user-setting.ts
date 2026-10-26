import { RpcMessageType, RpcRequestMessage, RpcResponseMessage } from "@/types";
import BackendWebSocketServer from "../utils/BackendWebSocketServer";
import PathUtil from "../utils/PathUtil";
import isEqual from "lodash/isEqual";
import fs from "node:fs/promises";
import fsExtra from "fs-extra/esm";
import { join } from "node:path";
import { migrateSyncPluginSettings } from "../services/sync-settings-migration";
import { migrateUploadSettings } from "../services/upload-settings-migration";
import { migrateTTSSettings } from "../services/tts-settings-migration";
import { migrateImageSettings } from "../services/image-settings-migration";
import { migrateVideoSettings } from "../services/video-settings-migration";
import {
  migratePublishSettings,
  assertCurrentPublishSettings,
} from "../services/publish-settings-migration";
import { publicationGitService } from "../services/publication-git-service";

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
  private settingLoadPromise: Promise<UserSetting> | null = null;
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

  /** 只写该插件的配置，当前选用的服务不变。 */
  async updateProviderPlugin(
    group: "sync" | "imageBed",
    id: string,
    config: unknown
  ): Promise<void> {
    const snapshot = structuredClone(config);
    await this.updateSetting(current => ({
      ...current,
      [group]: {
        ...current[group],
        plugin: {
          id: current[group]?.plugin?.id ?? "",
          configurations: { ...current[group]?.plugin?.configurations, [id]: snapshot },
        },
      },
    }));
  }

  async updatePublishPlugin(id: string, config: unknown): Promise<void> {
    const snapshot = structuredClone(config);
    await this.updateSetting(current => ({
      ...current,
      publish: {
        ...current.publish,
        plugin: {
          ...current.publish?.plugin,
          configurations: { ...current.publish?.plugin?.configurations, [id]: snapshot },
        },
      },
    }));
  }

  async updateTTSPlugin(
    instanceId: string,
    pluginId: string,
    config: unknown,
    models: readonly { id: string; label?: string }[]
  ) {
    if (
      !Array.isArray(models) ||
      models.some(model => !model || typeof model.id !== "string" || !model.id.trim()) ||
      new Set(models.map(model => model.id)).size !== models.length
    )
      throw new Error("语音模型列表无效");
    const snapshot = structuredClone({ config, models });
    await this.updateSetting(current => {
      const providers: import("@/types/tts").TTSProviderSetting[] = Array.isArray(
        current.ttsProviders
      )
        ? current.ttsProviders
        : [];
      const index = providers.findIndex(
        item => item.id === instanceId && "pluginId" in item && item.pluginId === pluginId
      );
      if (index < 0) throw new Error("语音账号已删除或归属已变化");
      const usage = current.ttsUsageSettings?.default;
      const ttsUsageSettings =
        usage?.providerId === instanceId &&
        !snapshot.models.some(model => model.id === usage.modelId)
          ? {
              ...current.ttsUsageSettings,
              default: { ...usage, modelId: snapshot.models[0]?.id ?? "", voiceId: "" },
            }
          : current.ttsUsageSettings;
      return {
        ...current,
        ttsProviders: providers.map((provider, position) =>
          position === index ? { ...provider, ...snapshot } : provider
        ),
        ...(ttsUsageSettings ? { ttsUsageSettings } : {}),
      };
    });
  }

  /** 在线视频提供方每个插件一份配置，不改变其他插件的配置。 */
  async updateVideoPlugin(pluginId: string, config: unknown): Promise<void> {
    const snapshot = structuredClone(config);
    await this.updateSetting(current => ({
      ...current,
      onlineVideo: {
        ...current.onlineVideo,
        configurations: { ...current.onlineVideo?.configurations, [pluginId]: snapshot },
      },
    }));
  }

  async updateImagePlugin(instanceId: string, pluginId: string, config: unknown, modelId: string) {
    if (typeof modelId !== "string" || !modelId.trim()) throw new Error("图片模型不能为空");
    const snapshot = structuredClone({ config, modelId });
    await this.updateSetting(current => {
      const imageGeneration = current.imageGeneration;
      const providers: import("@/types/imageGeneration").ImageProviderConfig[] = Array.isArray(
        imageGeneration?.providers
      )
        ? imageGeneration.providers
        : [];
      if (!providers.some(item => item.id === instanceId && item.pluginId === pluginId))
        throw new Error("图片账号已删除或归属已变化");
      return {
        ...current,
        imageGeneration: {
          ...imageGeneration,
          providers: providers.map(item =>
            item.id === instanceId && item.pluginId === pluginId ? { ...item, ...snapshot } : item
          ),
        },
      };
    });
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
    if (!this.settingLoadPromise) {
      this.settingLoadPromise = this.loadSetting()
        .then(setting =>
          migrateSyncPluginSettings(setting, PathUtil.getAppDir(), next =>
            this.saveSetting(JSON.stringify(next, null, 2))
          )
        )
        .then(setting =>
          migrateUploadSettings(setting, PathUtil.getAppDir(), next =>
            this.saveSetting(JSON.stringify(next, null, 2))
          )
        )
        .then(setting =>
          migrateTTSSettings(setting, PathUtil.getAppDir(), next =>
            this.saveSetting(JSON.stringify(next, null, 2))
          )
        )
        .then(setting =>
          migrateImageSettings(setting, PathUtil.getAppDir(), next =>
            this.saveSetting(JSON.stringify(next, null, 2))
          )
        )
        .then(setting =>
          migratePublishSettings(
            setting,
            PathUtil.getAppDir(),
            next => this.saveSetting(JSON.stringify(next, null, 2)),
            directory => publicationGitService.registerDirectory(directory)
          )
        )
        .then(setting =>
          migrateVideoSettings(setting, PathUtil.getAppDir(), next =>
            this.saveSetting(JSON.stringify(next, null, 2))
          )
        )
        .then(setting => {
          this.userSetting = setting;
          this.settingLoaded = true;
          return setting;
        })
        .finally(() => {
          this.settingLoadPromise = null;
        });
    }
    return this.settingLoadPromise;
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
          await this.handleSetUserSetting(payloadSetting, clientId);
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
    const snapshot = structuredClone(newSettings);
    return this.updateSetting(current => {
      // 语音账号由专用命令写入，旧窗口的整份设置不得覆盖它。
      if (current.speechInput === undefined) delete snapshot.speechInput;
      else snapshot.speechInput = current.speechInput;
      return snapshot;
    }, clientId);
  }

  async updateSetting(
    update: (current: UserSetting) => UserSetting,
    clientId?: string
  ): Promise<void> {
    await this.ensureSettingLoaded();
    const operation = this.savingChain
      .catch(() => undefined)
      .then(async () => {
        const previous = this.userSetting;
        const next = update(previous);
        assertCurrentPublishSettings(next);
        if (isEqual(previous, next)) return;
        await this.writeSettingFile(JSON.stringify(next, null, 2));
        this.userSetting = next;
        try {
          this.backendServer?.sendNotification("user-setting-changed", { setting: next, clientId });
        } catch (error) {
          console.error("[UserSettingModule] 设置已保存，但广播失败", error);
        }
        this.notifySettingChanged({ oldSetting: previous, newSetting: next });
      });
    this.savingChain = operation;
    return operation;
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
      console.info("[UserSettingModule] 读取用户设置");
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

  private isSetUserSettingPayload(
    params: object
  ): params is { setting: UserSetting; clientId?: string } {
    return Object.prototype.hasOwnProperty.call(params, "setting");
  }
}

export default new UserSettingModule();
