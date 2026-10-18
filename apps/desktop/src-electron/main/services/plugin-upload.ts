import { randomUUID } from "node:crypto";
import type { WebContents } from "electron";
import type { UploadRequest, UploadRendererReply } from "../../../shared/upload-renderer";

/** 只转发到主窗口已连接的渲染宿主，不加载插件代码。 */
export class PluginUploadRelay {
  private readonly hosts = new Map<number, { contents: WebContents; session: string }>();
  private readonly pending = new Map<
    string,
    {
      caller: number;
      host: number;
      session: string;
      resolve(url: string): void;
      reject(error: Error): void;
    }
  >();
  private readonly watched = new WeakSet<WebContents>();

  connect(contents: WebContents, session: string) {
    const previous = this.hosts.get(contents.id);
    if (previous) this.release(contents.id, previous.session);
    this.hosts.set(contents.id, { contents, session });
    this.watch(contents);
  }

  private watch(contents: WebContents) {
    if (this.watched.has(contents)) return;
    this.watched.add(contents);
    const release = () => this.release(contents.id);
    contents.once("destroyed", release);
    contents.on("did-navigate", release);
    contents.on("render-process-gone", release);
  }

  release(owner: number, session?: string) {
    if (session && this.hosts.get(owner)?.session !== session) return;
    this.hosts.delete(owner);
    for (const [id, request] of this.pending) {
      if (request.host === owner || request.caller === owner) {
        this.pending.delete(id);
        request.reject(new Error("上传窗口或插件宿主已关闭，请重新打开后重试"));
      }
    }
  }

  upload(caller: WebContents, request: UploadRequest): Promise<string> {
    const host = this.hosts.get(caller.id) ?? this.hosts.values().next().value;
    if (!host || host.contents.isDestroyed())
      return Promise.reject(new Error("主窗口插件宿主不可用，请打开主窗口后重试"));
    if (caller.isDestroyed()) return Promise.reject(new Error("上传窗口已关闭"));
    this.watch(caller);
    const requestId = randomUUID();
    return new Promise((resolve, reject) => {
      this.pending.set(requestId, {
        caller: caller.id,
        host: host.contents.id,
        session: host.session,
        resolve,
        reject,
      });
      try {
        host.contents.send("plugin-upload:request", {
          ...request,
          requestId,
          session: host.session,
        });
      } catch (error) {
        this.pending.delete(requestId);
        reject(error);
      }
    });
  }

  reply(owner: number, reply: UploadRendererReply) {
    const request = this.pending.get(reply.requestId);
    if (!request || request.host !== owner || request.session !== reply.session) return;
    this.pending.delete(reply.requestId);
    if (reply.error !== undefined) request.reject(new Error(reply.error));
    else if (typeof reply.url !== "string") request.reject(new Error("上传插件未返回资源地址"));
    else request.resolve(reply.url);
  }
}

export const pluginUploadRelay = new PluginUploadRelay();
