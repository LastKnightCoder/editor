import { describe, expect, it } from "vitest";
import { DEFAULT_API_BASE_URL, resolvePortalEnv } from "./env";

describe("运行配置", () => {
  it("默认连本地后端，且默认不启用模拟", () => {
    expect(resolvePortalEnv({ DEV: true })).toEqual({
      apiBaseUrl: DEFAULT_API_BASE_URL,
      mock: false,
    });
  });

  it("模拟模式必须显式写 true", () => {
    expect(resolvePortalEnv({ DEV: true, VITE_MOCK_API: "1" }).mock).toBe(false);
    expect(resolvePortalEnv({ DEV: true, VITE_MOCK_API: "true" }).mock).toBe(true);
  });

  it("构建产物启用模拟直接报错", () => {
    expect(() => resolvePortalEnv({ DEV: false, VITE_MOCK_API: "true" })).toThrow();
  });

  it("去掉 API 地址末尾斜杠", () => {
    expect(
      resolvePortalEnv({ DEV: false, VITE_API_BASE_URL: "https://api.example.com/" }).apiBaseUrl
    ).toBe("https://api.example.com");
  });
});
