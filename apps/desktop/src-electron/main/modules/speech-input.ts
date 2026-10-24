import { app, ipcMain, type WebContents } from "electron";
import type { ASRAudioFrame, ASRStreamSession } from "@tau/asr";
import {
  validateSpeechRefinementPreferences,
  defaultSpeechInputSetting,
  type SpeechInputSetting,
} from "@tau/asr";
import { copyJson } from "@tau/plugins/host";
import type { SocketMessage } from "@tau/plugins/websocket-bridge";
import type { SocketRequest } from "@tau/plugins/websocket-bridge";
import { NativeSpeechService } from "../services/native-speech";
import { PluginWebSocketService } from "../services/plugin-websocket";
import database from "./database";
import userSetting from "./user-setting";

interface Lease {
  owner: WebContents;
  id: string;
  controller: AbortController;
  session?: ASRStreamSession;
  starting?: boolean;
  timer: ReturnType<typeof setTimeout>;
}
class SpeechInputModule {
  name = "speech-input";
  private native = new NativeSpeechService();
  private sockets = new PluginWebSocketService();
  private lease?: Lease;
  private watched = new Set<number>();
  private release(notify: boolean) {
    const lease = this.lease;
    if (!lease) return;
    this.lease = undefined;
    clearTimeout(lease.timer);
    lease.controller.abort();
    void lease.session?.cancel().catch(() => undefined);
    if (notify && !lease.owner.isDestroyed())
      lease.owner.send("speech-input:closed", { taskId: lease.id });
  }
  private current(owner: WebContents, id: string) {
    if (!this.lease || this.lease.owner.id !== owner.id || this.lease.id !== id)
      throw new Error("语音输入会话已结束");
    return this.lease;
  }
  private watch(owner: WebContents) {
    if (this.watched.has(owner.id)) return;
    this.watched.add(owner.id);
    const stop = () => {
      this.sockets.releaseOwner(owner.id);
      if (this.lease?.owner.id === owner.id) this.release(false);
    };
    owner.once("destroyed", () => {
      stop();
      this.watched.delete(owner.id);
    });
    owner.on("render-process-gone", stop);
    owner.on("did-start-navigation", (_event, _url, _inPlace, mainFrame) => {
      if (mainFrame) stop();
    });
  }
  async init() {
    ipcMain.handle(
      "speech-input:settings",
      async (
        _event,
        operation: {
          kind: "save" | "select" | "refinement";
          refinement?: unknown;
          pluginId?: string;
          modelId?: string;
          config?: unknown;
          expected?: unknown;
        }
      ) => {
        if (!operation || !["save", "select", "refinement"].includes(operation.kind))
          throw new Error("语音输入设置操作无效");
        const id = operation.pluginId;
        if (id !== undefined && !/^[a-z0-9][a-z0-9.-]{0,127}$/.test(id))
          throw new Error("识别插件身份无效");
        const config = operation.kind === "save" ? copyJson(operation.config) : null;
        if (JSON.stringify(config).length > 1024 * 1024) throw new Error("识别配置过大");
        await userSetting.updateSetting(current => {
          const before: SpeechInputSetting = current.speechInput ?? defaultSpeechInputSetting();
          let speechInput: SpeechInputSetting;
          if (operation.kind === "refinement") {
            speechInput = {
              ...before,
              refinement: validateSpeechRefinementPreferences(operation.refinement),
            };
          } else if (operation.kind === "save") {
            const modelId = operation.modelId;
            if (!id || !modelId?.trim()) throw new Error("识别模型不能为空");
            speechInput = {
              ...before,
              plugin: {
                ...before.plugin,
                configurations: {
                  ...before.plugin.configurations,
                  [id]: { modelId, config },
                },
              },
            };
          } else if (!id) speechInput = { ...before, active: "native" };
          else {
            if (
              !Object.hasOwn(before.plugin.configurations, id) ||
              JSON.stringify(before.plugin.configurations[id]) !==
                JSON.stringify(operation.expected)
            )
              throw new Error("识别配置已变化，请重新选用");
            speechInput = { ...before, active: "plugin", plugin: { ...before.plugin, id } };
          }
          return { ...current, speechInput };
        });
        return (await userSetting.getSettingSnapshot()).speechInput;
      }
    );
    database.onDatabaseChange(() => {
      this.release(true);
      for (const owner of this.watched) this.sockets.releaseOwner(owner);
    });
    app.on("quit", () => {
      this.release(false);
      this.native.dispose();
      for (const owner of this.watched) this.sockets.releaseOwner(owner);
    });
    ipcMain.handle("plugin-socket:open", (event, id: string, request: SocketRequest) => {
      this.watch(event.sender);
      return this.sockets.open(event.sender.id, id, request);
    });
    ipcMain.handle("plugin-socket:send", (event, id: string, message: SocketMessage) =>
      this.sockets.send(event.sender.id, id, message)
    );
    ipcMain.handle("plugin-socket:receive", (event, id: string) =>
      this.sockets.receive(event.sender.id, id)
    );
    ipcMain.handle("plugin-socket:dispose", (event, id: string) =>
      this.sockets.dispose(event.sender.id, id)
    );
    ipcMain.handle("plugin-socket:close", (event, id: string, code?: number, reason?: string) =>
      this.sockets.close(event.sender.id, id, code, reason)
    );
    ipcMain.handle("speech-input:probe", (_event, language: string) =>
      this.native.availability(language, false, new AbortController().signal)
    );
    ipcMain.handle("speech-input:claim", (event, id: string) => {
      if (typeof id !== "string" || !/^[a-zA-Z0-9-]{1,80}$/.test(id))
        throw new Error("语音任务身份无效");
      if (this.lease) throw new Error("另一个窗口正在使用语音输入");
      this.watch(event.sender);
      this.lease = {
        owner: event.sender,
        id,
        controller: new AbortController(),
        timer: setTimeout(() => this.release(true), 30_000),
      };
    });
    ipcMain.handle("speech-input:heartbeat", (event, id: string) => {
      const lease = this.current(event.sender, id);
      clearTimeout(lease.timer);
      lease.timer = setTimeout(() => this.release(true), 30_000);
    });
    ipcMain.handle("speech-input:release", (event, id: string) => {
      if (this.lease?.owner.id === event.sender.id && this.lease.id === id) this.release(false);
    });
    ipcMain.handle("speech-input:prepare", (event, id: string, language: string) =>
      this.native.availability(language, true, this.current(event.sender, id).controller.signal)
    );
    ipcMain.handle("speech-input:start", async (event, id: string, language: string) => {
      const lease = this.current(event.sender, id);
      if (lease.session || lease.starting) throw new Error("系统语音会话已启动");
      lease.starting = true;
      lease.session = await this.native.open(language, {
        taskId: id,
        signal: lease.controller.signal,
        onEvent: value => {
          if (this.lease === lease && !event.sender.isDestroyed())
            event.sender.send("speech-input:event", value);
        },
      });
      if (this.lease !== lease) {
        await lease.session.cancel();
        throw new Error("语音输入已取消");
      }
    });
    ipcMain.handle("speech-input:write", (event, id: string, frame: ASRAudioFrame) => {
      const session = this.current(event.sender, id).session;
      if (!session) throw new Error("系统语音未就绪");
      return session.write(frame);
    });
    ipcMain.handle("speech-input:end", (event, id: string) => {
      const session = this.current(event.sender, id).session;
      if (!session) throw new Error("系统语音未就绪");
      return session.endInput();
    });
    ipcMain.handle("speech-input:result", (event, id: string) => {
      const session = this.current(event.sender, id).session;
      if (!session) throw new Error("系统语音未就绪");
      return session.result;
    });
  }
}
export default new SpeechInputModule();
