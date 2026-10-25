import { describe, expect, it } from "vitest";
import { DocumentWriteQueue } from "./document-write-queue";

describe("文档写入队列", () => {
  it("同文档串行，不同文档可推进，失败后释放预算并继续处理", async () => {
    const queue = new DocumentWriteQueue(8, 3),
      seen: string[] = [];
    let release!: () => void;
    const pending = new Promise<void>(resolve => {
      release = resolve;
    });
    const first = queue.run("A", 4, async () => {
      await pending;
      seen.push("first");
      throw new Error("write failed");
    });
    const failed = expect(first).rejects.toThrow("write failed");
    const second = queue.run("A", 2, async () => {
      seen.push("second");
    });
    await queue.run("B", 2, async () => {
      seen.push("other");
    });
    expect(seen).toEqual(["other"]);
    expect(() => queue.run("A", 3, async () => undefined)).toThrow("已满");
    release();
    await failed;
    await second;
    expect(seen).toEqual(["other", "first", "second"]);
    await queue.run("A", 8, async () => undefined);
  });
});
