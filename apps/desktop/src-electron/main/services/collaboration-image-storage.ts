import { randomUUID } from "node:crypto";
import type { WebContents } from "electron";
import type {
  CollaborationImageFile,
  OwnerImageReply,
} from "../../../shared/collaboration-image-storage";

/** 作者图片通过主窗口的常规上传流程保存，主进程不执行图床插件。 */
export class CollaborationImageStorage {
  private hosts = new Map<number, { contents: WebContents; session: string }>();
  private watched = new WeakSet<WebContents>();
  private pending = new Map<
    string,
    {
      host: number;
      session: string;
      finish(reference?: string, error?: string): void;
    }
  >();

  connect(contents: WebContents, session: string) {
    this.release(contents.id);
    this.hosts.set(contents.id, { contents, session });
    if (!this.watched.has(contents)) {
      this.watched.add(contents);
      const release = () => this.release(contents.id);
      contents.once("destroyed", release);
      contents.on("did-navigate", release);
      contents.on("render-process-gone", release);
    }
  }

  release(owner: number, session?: string) {
    const host = this.hosts.get(owner);
    if (!host || (session && host.session !== session)) return;
    this.hosts.delete(owner);
    for (const request of this.pending.values())
      if (request.host === owner && request.session === host.session)
        request.finish(undefined, "作者的图片存储窗口已关闭，资源仍保留在协作服务器");
  }

  save(file: CollaborationImageFile): Promise<string> {
    const host = [...this.hosts.values()].find(value => !value.contents.isDestroyed());
    if (!host) return Promise.reject(new Error("作者图片尚未保存，请打开主窗口后重试"));
    const requestId = randomUUID();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => finish(undefined, "作者图片保存超时，请重试"), 120_000);
      timer.unref();
      const finish = (reference?: string, error?: string) => {
        if (!this.pending.delete(requestId)) return;
        clearTimeout(timer);
        if (error) {
          try {
            if (!host.contents.isDestroyed())
              host.contents.send("collaboration:owner-image-cancel", {
                requestId,
                hostSession: host.session,
              });
          } catch {
            // 窗口退出不阻断保存失败的回执。
          }
          reject(new Error(error));
        } else if (reference) resolve(reference);
        else reject(new Error("作者图片存储未返回资源地址"));
      };
      this.pending.set(requestId, { host: host.contents.id, session: host.session, finish });
      try {
        host.contents.send("collaboration:owner-image-store", {
          requestId,
          hostSession: host.session,
          file,
        });
      } catch (error) {
        finish(undefined, error instanceof Error ? error.message : String(error));
      }
    });
  }

  reply(owner: number, reply: OwnerImageReply) {
    const request = this.pending.get(reply.requestId);
    if (request?.host === owner && request.session === reply.hostSession)
      request.finish(reply.reference, reply.error);
  }
}

export const collaborationImageStorage = new CollaborationImageStorage();
