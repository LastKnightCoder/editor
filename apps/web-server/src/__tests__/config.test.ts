import { afterEach, describe, expect, it, vi } from "vitest";
import { loadConfig } from "../config";

describe("Web Server 配置", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("显式开发模式允许省略令牌", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("AUTH_TOKEN", undefined);
    expect(loadConfig().authToken).toBeNull();
  });

  it.each(["production", "test", undefined])("%s 环境缺少令牌时拒绝启动", environment => {
    vi.stubEnv("NODE_ENV", environment);
    vi.stubEnv("AUTH_TOKEN", undefined);
    expect(() => loadConfig()).toThrow("非开发环境必须设置 AUTH_TOKEN");
  });

  it.each(["development", "production", "test"])("%s 环境拒绝空白令牌", environment => {
    vi.stubEnv("NODE_ENV", environment);
    for (const token of ["", " ", "\t\n"]) {
      vi.stubEnv("AUTH_TOKEN", token);
      expect(() => loadConfig()).toThrow("AUTH_TOKEN 不能为空或纯空白");
    }
  });

  it.each(["development", "production", "test", undefined])("%s 环境保留有效令牌", environment => {
    vi.stubEnv("NODE_ENV", environment);
    for (const token of ["test-token", "__missing__"]) {
      vi.stubEnv("AUTH_TOKEN", token);
      expect(loadConfig().authToken).toBe(token);
    }
  });
});
