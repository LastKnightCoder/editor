import { CollaborationError } from "./protocol";

/** 同文档按到达顺序校验与持久化；不同文档共享有界的排队预算。 */
export class DocumentWriteQueue {
  private tails = new Map<string, Promise<unknown>>();
  private bytes = 0;
  private requests = 0;
  constructor(
    private readonly maxBytes: number,
    private readonly maxRequests = 128
  ) {}

  run<T>(id: string, bytes: number, action: () => Promise<T>): Promise<T> {
    if (
      !Number.isSafeInteger(bytes) ||
      bytes < 0 ||
      this.bytes + bytes > this.maxBytes ||
      this.requests >= this.maxRequests
    )
      throw new CollaborationError("CAPACITY", "文档待处理更新已满，请保留本机编辑后重试", 429);
    this.bytes += bytes;
    this.requests++;
    const previous = this.tails.get(id) ?? Promise.resolve();
    const next = previous.catch(() => undefined).then(action);
    this.tails.set(id, next);
    void next
      .finally(() => {
        this.bytes -= bytes;
        this.requests--;
        if (this.tails.get(id) === next) this.tails.delete(id);
      })
      .catch(() => undefined);
    return next;
  }
}
