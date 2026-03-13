import { describe, expect, it } from "vitest";
import {
  buildLoginResultFromCookies,
  getLoginResultFromSession,
} from "../weread-login";

describe("weread login helpers", () => {
  it("应从已登录 cookie 中构造登录结果", () => {
    const result = buildLoginResultFromCookies([
      { name: "wr_name", value: "测试用户" },
      { name: "wr_vid", value: "vid-1" },
      { name: "wr_skey", value: "skey" },
    ]);

    expect(result).toEqual({
      cookies: [
        { name: "wr_name", value: "测试用户" },
        { name: "wr_vid", value: "vid-1" },
        { name: "wr_skey", value: "skey" },
      ],
      userName: "测试用户",
      userVid: "vid-1",
    });
  });

  it("缺少关键登录 cookie 时不应误判为已登录", () => {
    expect(
      buildLoginResultFromCookies([{ name: "wr_name", value: "测试用户" }]),
    ).toBeNull();
  });

  it("应能从 Electron session 中提取登录结果", async () => {
    const session = {
      cookies: {
        get: async () => [
          { name: "wr_name", value: "测试用户" },
          { name: "wr_vid", value: "vid-1" },
        ],
      },
    } as unknown as Electron.Session;

    await expect(
      getLoginResultFromSession(session, "https://weread.qq.com"),
    ).resolves.toEqual({
      cookies: [
        { name: "wr_name", value: "测试用户" },
        { name: "wr_vid", value: "vid-1" },
      ],
      userName: "测试用户",
      userVid: "vid-1",
    });
  });
});
