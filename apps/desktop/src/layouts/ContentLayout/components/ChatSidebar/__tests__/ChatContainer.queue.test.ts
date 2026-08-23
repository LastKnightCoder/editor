import { describe, expect, it } from "vitest";
import { ConversationMessageQueue } from "../messageQueue";

describe("ChatContainer 对话消息队列", () => {
  it("应按对话隔离消息并在各自队列内保持先进先出", () => {
    const queue = new ConversationMessageQueue<string>();

    queue.enqueue("chat:1", "消息 1");
    queue.enqueue("chat:2", "消息 2");
    queue.enqueue("chat:1", "消息 3");

    expect(queue.dequeue("chat:2")).toBe("消息 2");
    expect(queue.dequeue("chat:1")).toBe("消息 1");
    expect(queue.dequeue("chat:1")).toBe("消息 3");
    expect(queue.size("chat:1")).toBe(0);
  });

  it("临时对话落库后应迁移队列而不丢失消息", () => {
    const queue = new ConversationMessageQueue<string>();

    queue.enqueue("chat:42", "已有消息");
    queue.enqueue("chat:0", "临时消息 1");
    queue.enqueue("chat:0", "临时消息 2");

    expect(queue.move("chat:0", "chat:42")).toBe(3);
    expect(queue.size("chat:0")).toBe(0);
    expect(queue.dequeue("chat:42")).toBe("已有消息");
    expect(queue.dequeue("chat:42")).toBe("临时消息 1");
    expect(queue.dequeue("chat:42")).toBe("临时消息 2");
  });

  it("发送前发生对话切换时应将消息放回原队列头部", () => {
    const queue = new ConversationMessageQueue<string>();

    queue.enqueue("chat:1", "消息 2");
    queue.prepend("chat:1", "消息 1");
    queue.enqueue("chat:2", "其他对话消息");

    expect(queue.dequeue("chat:1")).toBe("消息 1");
    expect(queue.dequeue("chat:1")).toBe("消息 2");
    expect(queue.dequeue("chat:2")).toBe("其他对话消息");
  });
});
