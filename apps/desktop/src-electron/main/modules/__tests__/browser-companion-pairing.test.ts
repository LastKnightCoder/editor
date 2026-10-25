import { describe, expect, it } from "vitest";
import {
  isClientId,
  isExtensionOrigin,
  PAIR_COOLDOWN_MS,
  PAIR_DENY_LIMIT,
  PairingGate,
} from "../browser-companion/pairing-gate";
import { CompanionPeer } from "../browser-companion/peer";

describe("PairingGate", () => {
  it("窗口期内拒绝达到上限后冷却，冷却结束放行", () => {
    let now = 0;
    const gate = new PairingGate(() => now);
    for (let i = 0; i < PAIR_DENY_LIMIT - 1; i += 1) gate.recordDenial("c");
    expect(gate.blockedUntil("c")).toBeNull();
    gate.recordDenial("c");
    expect(gate.blockedUntil("c")).toBe(PAIR_COOLDOWN_MS);
    expect(gate.blockedUntil("other")).toBeNull();
    now = PAIR_COOLDOWN_MS + 1;
    expect(gate.blockedUntil("c")).toBeNull();
  });

  it("允许一次清零", () => {
    const gate = new PairingGate(() => 0);
    gate.recordDenial("c");
    gate.recordDenial("c");
    gate.recordGrant("c");
    gate.recordDenial("c");
    expect(gate.blockedUntil("c")).toBeNull();
  });
});

describe("来源与 clientId", () => {
  it("只放行浏览器扩展来源", () => {
    expect(isExtensionOrigin(`chrome-extension://${"a".repeat(32)}`)).toBe(true);
    expect(isExtensionOrigin("moz-extension://0f0e0d0c-1111-2222-3333-444455556666")).toBe(true);
    expect(isExtensionOrigin("https://evil.com")).toBe(false);
    expect(isExtensionOrigin("file://")).toBe(false);
    expect(isExtensionOrigin(undefined)).toBe(false);
    expect(isExtensionOrigin(`chrome-extension://${"z".repeat(32)}`)).toBe(false);
  });
  it("clientId 格式", () => {
    expect(isClientId("abcDEF0123456789")).toBe(true);
    expect(isClientId("short")).toBe(false);
    expect(isClientId("../../etc/passwd/xx")).toBe(false);
  });
});

describe("CompanionPeer", () => {
  const socket = () => {
    const sent: string[] = [];
    return { sent, send: (data: string) => sent.push(data), close: () => {} };
  };

  it("请求经 handler 回响应，handler 抛错转成 error", async () => {
    const io = socket();
    const peer = new CompanionPeer(io, async method => {
      if (method === "boom") throw new Error("坏了");
      return { ok: method };
    });
    await peer.receive(JSON.stringify({ type: "JsonRpcRequest", id: "1", method: "hi" }));
    await peer.receive(JSON.stringify({ type: "JsonRpcRequest", id: "2", method: "boom" }));
    expect(JSON.parse(io.sent[0])).toMatchObject({ id: "1", result: { ok: "hi" }, error: null });
    expect(JSON.parse(io.sent[1])).toMatchObject({ id: "2", error: { message: "坏了" } });
  });

  it("反向请求按 id 收响应；断开时拒绝未决请求", async () => {
    const io = socket();
    const peer = new CompanionPeer(io, async () => null);
    const pending = peer.request("page.tool", {}, 1000);
    const { id } = JSON.parse(io.sent[0]);
    await peer.receive(
      JSON.stringify({ type: "JsonRpcResponse", id, method: "page.tool", result: 7 })
    );
    expect(await pending).toBe(7);
    const lost = peer.request("page.tool", {}, 1000);
    peer.dispose();
    await expect(lost).rejects.toThrow("断开");
  });

  it("非法帧忽略", async () => {
    const io = socket();
    const peer = new CompanionPeer(io, async () => null);
    expect(await peer.receive("garbage")).toBeNull();
    expect(io.sent).toHaveLength(0);
  });
});
