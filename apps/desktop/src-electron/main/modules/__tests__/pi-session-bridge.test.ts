/**
 * desktopMessagesToPi 的用户消息转换：读不到的图片换成文字占位，不能整条丢
 * （老对话迁移时不下载远程图，只发了一张图的用户消息原来会消失，前后两条回答连成一条）。
 */
import { describe, expect, it, vi } from "vitest";
import type { RequestMessage } from "@/types";
import { desktopMessagesToPi, PiToolCallBridge } from "../pi-session-bridge";

const user = (content: RequestMessage["content"]) => ({ role: "user", content }) as RequestMessage;

it("中止会通知真实执行端，迟到结果不复活已取消调用", async () => {
  const send = vi.fn();
  const bridge = new PiToolCallBridge({ isDestroyed: () => false, send }, "s");
  const tool = bridge.toToolDefinitions([{ name: "tool", description: "工具", parameters: {} }])[0];
  const controller = new AbortController();
  const result = tool.execute("call", {}, controller.signal, undefined, {} as never);
  controller.abort();
  bridge.handleResult("call", { content: "迟到" });
  await expect(result).rejects.toThrow("中止");
  expect(send.mock.calls.map(call => call[0])).toEqual(["pi-tool-call", "pi-tool-cancel"]);
});

it("参数错误、MCP 错误和执行异常均拒绝工具调用，pi 才会标记失败", async () => {
  const bridge = new PiToolCallBridge({ isDestroyed: () => false, send: () => {} }, "s");
  const tool = bridge.toToolDefinitions([{ name: "tool", description: "工具", parameters: {} }])[0];
  for (const result of [
    { content: "参数错误", isError: true },
    { content: "远端错误", metadata: { isError: true } },
  ]) {
    const pending = tool.execute("call", {}, new AbortController().signal, undefined, {} as never);
    bridge.handleResult("call", result);
    await expect(pending).rejects.toThrow(result.content);
  }
  const pending = tool.execute("call", {}, new AbortController().signal, undefined, {} as never);
  bridge.handleError("call", "磁盘错误");
  await expect(pending).rejects.toThrow("磁盘错误");
});

it("同一 toolCallId 重用时，旧执行的迟到错误与结果不会污染新执行", async () => {
  const send = vi.fn();
  const bridge = new PiToolCallBridge({ isDestroyed: () => false, send }, "s");
  const tool = bridge.toToolDefinitions([{ name: "tool", description: "工具", parameters: {} }])[0];
  const firstController = new AbortController();
  const first = tool.execute("reused", {}, firstController.signal, undefined, {} as never);
  const oldId = send.mock.calls[0][1].executionId;
  firstController.abort();
  await expect(first).rejects.toThrow("中止");
  const second = tool.execute("reused", {}, new AbortController().signal, undefined, {} as never);
  const nextId = send.mock.calls.at(-1)![1].executionId;
  bridge.handleError("reused", "旧错误", oldId);
  bridge.handleResult("reused", { content: "旧结果" }, oldId);
  bridge.handleResult("reused", { content: "新结果" }, nextId);
  await expect(second).resolves.toMatchObject({ content: [{ type: "text", text: "新结果" }] });
});

describe("desktopMessagesToPi 用户消息", () => {
  it("只有一张远程图、不允许联网：保留这条消息，图换成带地址的文字占位", async () => {
    const [message] = await desktopMessagesToPi(
      [user([{ type: "image", image: "http://example.com/a.webp" } as never])],
      "p",
      "m",
      { allowNetwork: false }
    );
    expect(message).toMatchObject({
      role: "user",
      content: [{ type: "text", text: "[图片：http://example.com/a.webp]" }],
    });
  });

  it("本地图文件已不在：占位说明原文件不可用；data URL 照常转成图片", async () => {
    const messages = await desktopMessagesToPi(
      [
        user([
          { type: "text", text: "看图" },
          { type: "image", image: "tau://missing.png", path: "D:/不存在/missing.png" } as never,
          { type: "image", image: "data:image/png;base64,AAAA" } as never,
        ]),
      ],
      "p",
      "m",
      { allowNetwork: false }
    );
    expect(messages).toHaveLength(1);
    expect(messages[0].content).toEqual([
      { type: "text", text: "看图" },
      { type: "text", text: "[图片（原文件已不可用）]" },
      { type: "image", data: "AAAA", mimeType: "image/png" },
    ]);
  });
});
