import { describe, expect, it } from "vitest";
import { ConversationMessageQueue } from "./messageQueue";

describe("ConversationMessageQueue", () => {
  it("支持查看、编辑替换和删除待发送消息", () => {
    const queue = new ConversationMessageQueue<string>();
    queue.enqueue("chat:1", "第一条");
    queue.enqueue("chat:1", "第二条");
    expect(queue.list("chat:1")).toEqual(["第一条", "第二条"]);
    expect(queue.replaceAt("chat:1", 0, "修改后的第一条")).toBe(true);
    expect(queue.removeAt("chat:1", 1)).toBe(1);
    expect(queue.list("chat:1")).toEqual(["修改后的第一条"]);
  });

  it("删除和取出最后一条后清理会话队列", () => {
    const queue = new ConversationMessageQueue<string>();
    queue.enqueue("chat:1", "消息");
    expect(queue.removeAt("chat:1", 0)).toBe(0);
    expect(queue.size("chat:1")).toBe(0);
    queue.enqueue("chat:1", "消息");
    expect(queue.dequeue("chat:1")).toBe("消息");
    expect(queue.list("chat:1")).toEqual([]);
  });
});
