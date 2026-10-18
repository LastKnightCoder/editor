import type { WebContents } from "electron";
import type { TTSRendererRequest, TTSRendererReply } from "../../../shared/tts-renderer";
interface Host {
  contents: WebContents;
  generation: string;
}
interface Session {
  owner: number;
  caller: WebContents;
  host: Host;
}
interface Pending {
  owner: number;
  session: string;
  host: Host;
  finish(reply: TTSRendererReply): void;
}
const aborted = (requestId: string, hostSession: string): TTSRendererReply => ({
  requestId,
  hostSession,
  error: "语音任务或窗口已结束",
  errorName: "AbortError",
});

/** 只绑定调用窗口与渲染宿主，不创建语音实例。 */
export class PluginTTSRelay {
  private readonly hosts = new Map<number, Host>();
  private readonly sessions = new Map<string, Session>();
  private readonly pending = new Map<string, Pending>();
  private readonly watched = new WeakSet<WebContents>();
  connect(contents: WebContents, generation: string) {
    this.release(contents.id);
    this.hosts.set(contents.id, { contents, generation });
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
  private close(id: string, notifyHost = true) {
    const session = this.sessions.get(id);
    if (!session) return;
    this.sessions.delete(id);
    if (notifyHost)
      this.control(session.host, "plugin-tts:close", {
        session: id,
        hostSession: session.host.generation,
      });
    try {
      if (!session.caller.isDestroyed())
        session.caller.send("plugin-tts:session-closed", { session: id });
    } catch {
      /* 调用窗口退出不阻断本地回收。 */
    }
    for (const [requestId, pending] of this.pending)
      if (pending.session === id) {
        this.pending.delete(requestId);
        pending.finish(aborted(requestId, pending.host.generation));
      }
  }
  rendererClosed(owner: number, hostSession: string, id: string) {
    const session = this.sessions.get(id);
    if (session?.host.contents.id === owner && session.host.generation === hostSession)
      this.close(id, false);
  }
  private control(host: Host, channel: string, data: object) {
    try {
      if (!host.contents.isDestroyed()) host.contents.send(channel, data);
    } catch {
      /* 渲染进程退出的竞态不能阻塞本地任务回收。 */
    }
  }
  release(owner: number, generation?: string) {
    if (generation && this.hosts.get(owner)?.generation !== generation) return;
    this.hosts.delete(owner);
    for (const [id, session] of this.sessions)
      if (session.owner === owner || session.host.contents.id === owner) this.close(id);
  }
  request(
    caller: WebContents,
    requestId: string,
    request: TTSRendererRequest
  ): Promise<TTSRendererReply> {
    if (caller.isDestroyed()) throw new Error("语音调用窗口已关闭");
    this.watch(caller);
    if (this.pending.has(requestId)) throw new Error("语音请求已存在");
    let session = this.sessions.get(request.session);
    if (request.kind === "open") {
      if (session) throw new Error("语音任务已存在");
      const host = this.hosts.get(caller.id) ?? this.hosts.values().next().value;
      if (!host || host.contents.isDestroyed()) throw new Error("主窗口语音插件宿主不可用");
      session = { owner: caller.id, caller, host };
      this.sessions.set(request.session, session);
    }
    if (!session)
      return Promise.resolve(
        request.kind === "close" ? { requestId, hostSession: "" } : aborted(requestId, "")
      );
    if (session.owner !== caller.id) throw new Error("语音任务不属于当前窗口");
    if (request.kind === "close") {
      this.close(request.session);
      return Promise.resolve({ requestId, hostSession: session.host.generation });
    }
    const host = session.host;
    return new Promise(resolve => {
      this.pending.set(requestId, {
        owner: caller.id,
        session: request.session,
        host,
        finish: reply => {
          if (request.kind === "open" && reply.error !== undefined) this.close(request.session);
          resolve(reply);
        },
      });
      try {
        host.contents.send("plugin-tts:request", {
          requestId,
          hostSession: host.generation,
          request,
        });
      } catch {
        this.close(request.session);
      }
    });
  }
  cancel(owner: number, requestId: string) {
    const pending = this.pending.get(requestId);
    if (!pending || pending.owner !== owner) return;
    this.pending.delete(requestId);
    this.control(pending.host, "plugin-tts:cancel", {
      requestId,
      hostSession: pending.host.generation,
    });
    pending.finish(aborted(requestId, pending.host.generation));
  }
  reply(owner: number, reply: TTSRendererReply) {
    const pending = this.pending.get(reply.requestId);
    if (
      !pending ||
      pending.host.contents.id !== owner ||
      pending.host.generation !== reply.hostSession
    )
      return;
    this.pending.delete(reply.requestId);
    pending.finish(reply);
  }
}
export const pluginTTSRelay = new PluginTTSRelay();
