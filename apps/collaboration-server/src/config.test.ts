import Fastify from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";
import { loadConfig } from "./config";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("反向代理配置", () => {
  it.each([
    { value: undefined, expected: "127.0.0.1" },
    { value: "", expected: "127.0.0.1" },
    { value: "true", expected: true },
    { value: "false", expected: false },
    { value: "172.18.0.1", expected: "172.18.0.1" },
    { value: "172.18.0.0/16", expected: "172.18.0.0/16" },
  ])("将 $value 解析为 $expected", ({ value, expected }) => {
    vi.stubEnv("COLLAB_TRUST_PROXY", value);
    expect(loadConfig().trustProxy).toBe(expected);
  });

  it.each([
    { value: "true", expectedIp: "203.0.113.10" },
    { value: "false", expectedIp: "172.18.0.1" },
  ])("Fastify 在配置为 $value 时正确处理代理 IP", async ({ value, expectedIp }) => {
    vi.stubEnv("COLLAB_TRUST_PROXY", value);
    const app = Fastify({ trustProxy: loadConfig().trustProxy });
    try {
      app.get("/", request => ({ ip: request.ip }));
      const response = await app.inject({
        method: "GET",
        url: "/",
        remoteAddress: "172.18.0.1",
        headers: { "x-forwarded-for": "203.0.113.10" },
      });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ ip: expectedIp });
    } finally {
      await app.close();
    }
  });

  it("显式配置优先于环境变量", () => {
    vi.stubEnv("COLLAB_TRUST_PROXY", "true");
    expect(loadConfig({ trustProxy: false }).trustProxy).toBe(false);
  });
});
