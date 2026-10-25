import { contentExecutor } from "../services/content-execution";
import type { IndexContentInput, IndexContentResult } from "./index-content-protocol";

/** 每轮索引持有取消作用域，内容转换交给浏览器环境执行。 */
export class IndexContentClient {
  private readonly controller = new AbortController();
  private pending = false;

  get signal(): AbortSignal {
    return this.controller.signal;
  }

  prepare(input: IndexContentInput): Promise<IndexContentResult> {
    if (this.controller.signal.aborted) return Promise.reject(new Error("正文转换已结束"));
    if (this.pending) return Promise.reject(new Error("正文转换必须串行执行"));
    this.pending = true;
    return contentExecutor
      .execute<IndexContentResult>({ operation: "index", input }, this.controller.signal)
      .finally(() => {
        this.pending = false;
      });
  }

  async dispose() {
    this.controller.abort();
  }
}
