import type { WebContents } from "electron";
import { ASRError, asrAbortError, throwIfASRAborted } from "@tau/asr";

export class ASRTaskRegistry {
  private active = new Map<string, { owner: number; controller: AbortController }>();
  async run<T>(
    owner: WebContents,
    id: string,
    execute: (signal: AbortSignal) => Promise<T>
  ): Promise<T> {
    if (typeof id !== "string" || !id || id.length > 128)
      throw new ASRError("invalid-input", "识别任务身份无效");
    if (owner.isDestroyed()) throw asrAbortError();
    const key = `${owner.id}:${id}`;
    if (this.active.has(key)) throw new ASRError("busy", "识别任务已存在");
    const controller = new AbortController();
    const abort = () => controller.abort(asrAbortError());
    const navigate = (_event: unknown, _url: string, _inPlace: boolean, mainFrame: boolean) => {
      if (mainFrame) abort();
    };
    this.active.set(key, { owner: owner.id, controller });
    owner.on("destroyed", abort);
    owner.on("render-process-gone", abort);
    owner.on("did-start-navigation", navigate);
    try {
      const result = await execute(controller.signal);
      throwIfASRAborted(controller.signal);
      return result;
    } finally {
      this.active.delete(key);
      owner.removeListener("destroyed", abort);
      owner.removeListener("render-process-gone", abort);
      owner.removeListener("did-start-navigation", navigate);
    }
  }
  cancel(owner: number, id: string) {
    this.active.get(`${owner}:${id}`)?.controller.abort(asrAbortError());
  }
  cancelAll() {
    for (const task of this.active.values()) task.controller.abort(asrAbortError());
  }
}
