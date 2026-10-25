import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { BrowserClientStore, normalizeScopes, tokenMatches } from "../browser-clients";

const ORIGIN = `chrome-extension://${"a".repeat(32)}`;
const INFO = { browser: "Chrome", os: "macOS", version: "0.1.0" };

describe("BrowserClientStore", () => {
  let dir: string;
  let store: BrowserClientStore;
  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "browser-clients-"));
    store = new BrowserClientStore(path.join(dir, "clients.json"), () => 1000);
  });
  afterEach(() => rm(dir, { recursive: true, force: true }));

  it("授权后只存 token 哈希，hello 校验 token 与来源", async () => {
    const { token, scopes } = await store.grant("client-0000000001", INFO, ORIGIN, ["tools"]);
    expect(scopes).toEqual(["chat", "annotations", "notes", "tools"]);
    const raw = await readFile(path.join(dir, "clients.json"), "utf8");
    expect(raw).not.toContain(token);

    expect(await store.verify("client-0000000001", token, ORIGIN)).toMatchObject({ scopes });
    expect(await store.verify("client-0000000001", "wrong", ORIGIN)).toBe("bad-token");
    expect(
      await store.verify("client-0000000001", token, `chrome-extension://${"b".repeat(32)}`)
    ).toBe("bad-token");
    expect(await store.verify("client-0000000002", token, ORIGIN)).toBe("unknown-client");
  });

  it("重新配对覆盖旧 token；撤销后无法再连", async () => {
    const first = await store.grant("client-0000000001", INFO, ORIGIN, []);
    const second = await store.grant("client-0000000001", INFO, ORIGIN, []);
    expect(await store.verify("client-0000000001", first.token, ORIGIN)).toBe("bad-token");
    expect((await store.snapshot()).clients).toHaveLength(1);
    expect(await store.revoke("client-0000000001")).toBe(true);
    expect(await store.verify("client-0000000001", second.token, ORIGIN)).toBe("unknown-client");
  });

  it("快照不含 tokenHash；拒绝记录最多 20 条", async () => {
    await store.grant("client-0000000001", INFO, ORIGIN, []);
    for (let i = 0; i < 25; i += 1)
      await store.recordRejection({ clientId: `c${i}`, label: "Chrome", reason: "用户拒绝" });
    const snapshot = await store.snapshot();
    expect(snapshot.clients[0]).not.toHaveProperty("tokenHash");
    expect(snapshot.rejections).toHaveLength(20);
    expect(snapshot.rejections[0].clientId).toBe("c24");
  });

  it("可调整可选权限，必需权限始终保留", async () => {
    await store.grant("client-0000000001", INFO, ORIGIN, ["tools"]);
    expect(await store.setScopes("client-0000000001", [])).toEqual([
      "chat",
      "annotations",
      "notes",
    ]);
    expect(await store.setScopes("missing", [])).toBeNull();
  });
});

describe("normalizeScopes / tokenMatches", () => {
  it("忽略未知权限", () => {
    expect(normalizeScopes(["tools", "admin", 1])).toEqual([
      "chat",
      "annotations",
      "notes",
      "tools",
    ]);
    expect(normalizeScopes(null)).toEqual(["chat", "annotations", "notes"]);
  });
  it("哈希长度不一致不抛错", () => {
    expect(tokenMatches("x", "abcd")).toBe(false);
  });
});
