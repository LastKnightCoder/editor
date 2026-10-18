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
      contents: WebContents;
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
        this.notifyCancel(request.contents, id, request.session);
        request.reject(new Error("上传窗口或插件宿主已关闭，请重新打开后重试"));
      }
    }
  }

  private notifyCancel(contents: WebContents, requestId: string, session: string) {
    try {
      if (!contents.isDestroyed()) contents.send("plugin-upload:cancel", { requestId, session });
    } catch {
      /* 渲染进程退出的竞态不能阻塞本地请求回收。 */
    }
  }

  upload(
    caller: WebContents,
    request: UploadRequest,
    requestId: string = randomUUID()
  ): Promise<string> {
    const host = this.hosts.get(caller.id) ?? this.hosts.values().next().value;
    if (!host || host.contents.isDestroyed())
      return Promise.reject(new Error("主窗口插件宿主不可用，请打开主窗口后重试"));
    if (caller.isDestroyed()) return Promise.reject(new Error("上传窗口已关闭"));
    this.watch(caller);
    if (this.pending.has(requestId)) return Promise.reject(new Error("上传请求已存在"));
    return new Promise((resolve, reject) => {
      this.pending.set(requestId, {
        caller: caller.id,
        host: host.contents.id,
        session: host.session,
        contents: host.contents,
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

  cancel(owner: number, requestId: string) {
    const request = this.pending.get(requestId);
    if (!request || request.caller !== owner) return;
    this.pending.delete(requestId);
    this.notifyCancel(request.contents, requestId, request.session);
    request.reject(new DOMException("上传已取消", "AbortError"));
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
