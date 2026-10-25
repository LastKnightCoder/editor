import { describe, expect, it } from "vitest";
import { COMPANION_METHODS, METHOD_SCOPES, parseRpcFrame, REQUIRED_SCOPES } from "../protocol";
import { deriveSas, isNonce, randomHex } from "../sas";

describe("parseRpcFrame", () => {
  it("接受三种信封", () => {
    expect(parseRpcFrame('{"type":"JsonRpcRequest","id":"1","method":"hello"}')).toMatchObject({
      method: "hello",
    });
    expect(parseRpcFrame('{"type":"JsonRpcResponse","id":"1","method":"x","result":1}')).not.toBe(
      null
    );
    expect(parseRpcFrame('{"type":"JsonRpcNotification","method":"ready"}')).not.toBe(null);
  });

  it("拒绝非法输入", () => {
    expect(parseRpcFrame("not json")).toBe(null);
    expect(parseRpcFrame("null")).toBe(null);
    expect(parseRpcFrame('{"type":"JsonRpcRequest","method":"hello"}')).toBe(null);
    expect(parseRpcFrame('{"type":"ping","id":"1","method":"x"}')).toBe(null);
  });
});

describe("METHOD_SCOPES", () => {
  it("握手与反向方法不在扩展可调表里", () => {
    for (const method of [
      COMPANION_METHODS.hello,
      COMPANION_METHODS.pairRequest,
      COMPANION_METHODS.pageTool,
    ]) {
      expect(METHOD_SCOPES[method]).toBeUndefined();
    }
  });

  it("可调方法的 scope 都在必需集或 search 内", () => {
    for (const scope of Object.values(METHOD_SCOPES)) {
      expect([...REQUIRED_SCOPES, "tools"]).toContain(scope);
    }
  });
});

describe("deriveSas", () => {
  it("同一对随机数得到同一个 4 位码", async () => {
    const a = randomHex();
    const b = randomHex();
    const code = await deriveSas(a, b);
    expect(code).toMatch(/^\d{4}$/);
    expect(await deriveSas(a, b)).toBe(code);
  });

  it("不同随机数分布到不同的码", async () => {
    const codes = new Set<string>();
    for (let i = 0; i < 20; i += 1) codes.add(await deriveSas(randomHex(), randomHex()));
    expect(codes.size).toBeGreaterThan(10);
  });

  it("isNonce 只认 hex", () => {
    expect(isNonce(randomHex())).toBe(true);
    expect(isNonce("xyz")).toBe(false);
    expect(isNonce(42)).toBe(false);
  });
});
