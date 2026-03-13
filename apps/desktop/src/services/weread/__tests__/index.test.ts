import { afterEach, describe, expect, it, vi } from "vitest";
import useSettingStore from "@/stores/useSettingStore";
import weReadService from "..";

const { weReadHttpRequestMock, weReadLoginWithQRCodeMock } = vi.hoisted(() => ({
  weReadHttpRequestMock: vi.fn(),
  weReadLoginWithQRCodeMock: vi.fn(),
}));

vi.mock("@/commands/weread", () => ({
  weReadHttpRequest: weReadHttpRequestMock,
  weReadLoginWithQRCode: weReadLoginWithQRCodeMock,
}));

const createDeferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

describe("services/weread session validation", () => {
  const initialSetting = structuredClone(useSettingStore.getState().setting);

  afterEach(() => {
    vi.clearAllMocks();
    useSettingStore.setState((state) => ({
      ...state,
      setting: structuredClone(initialSetting),
    }));
  });

  it("应在会话校验成功后标记为可用", async () => {
    useSettingStore.setState((state) => ({
      ...state,
      setting: {
        ...state.setting,
        integration: {
          ...state.setting.integration,
          weread: {
            ...state.setting.integration.weread,
            cookies: [
              { name: "wr_name", value: "测试用户" },
              { name: "wr_vid", value: "vid-1" },
            ],
          },
        },
      },
    }));

    weReadHttpRequestMock.mockResolvedValue({
      status: 200,
      ok: true,
      data: { errcode: 0 },
      cookies: [
        { name: "wr_name", value: "测试用户" },
        { name: "wr_vid", value: "vid-1" },
      ],
    });

    await expect(weReadService.validateSession()).resolves.toBe(true);

    const { weread } = useSettingStore.getState().setting.integration;
    expect(weread.sessionStatus).toBe("valid");
    expect(weread.userInfo).toEqual({
      name: "测试用户",
      vid: "vid-1",
      isConnected: true,
    });
    expect(weread.statusReason).toBe("");
    expect(weread.lastValidatedAt).toBeGreaterThan(0);
  });

  it("应在 401 时清空本地状态并标记为失效", async () => {
    useSettingStore.setState((state) => ({
      ...state,
      setting: {
        ...state.setting,
        integration: {
          ...state.setting.integration,
          weread: {
            ...state.setting.integration.weread,
            cookies: [
              { name: "wr_name", value: "测试用户" },
              { name: "wr_vid", value: "vid-1" },
            ],
            userInfo: {
              name: "测试用户",
              vid: "vid-1",
              isConnected: true,
            },
          },
        },
      },
    }));

    weReadHttpRequestMock.mockResolvedValue({
      status: 401,
      ok: false,
      data: null,
      cookies: [],
    });

    await expect(weReadService.validateSession()).resolves.toBe(false);

    const { weread } = useSettingStore.getState().setting.integration;
    expect(weread.sessionStatus).toBe("invalid");
    expect(weread.cookies).toEqual([]);
    expect(weread.userInfo).toEqual({
      name: "",
      vid: "",
      isConnected: false,
    });
    expect(weread.statusReason).toContain("登录状态已过期");
  });

  it("应在手动输入失效 Cookie 时阻止继续显示可用", async () => {
    weReadHttpRequestMock.mockResolvedValue({
      status: 200,
      ok: true,
      data: { errcode: -2012, errmsg: "登录已过期" },
      cookies: [],
    });

    await expect(
      weReadService.loginWithCookieString("wr_name=测试用户; wr_vid=vid-1"),
    ).rejects.toThrow("登录已过期");

    const { weread } = useSettingStore.getState().setting.integration;
    expect(weread.sessionStatus).toBe("invalid");
    expect(weread.cookies).toEqual([]);
    expect(weread.userInfo.isConnected).toBe(false);
  });

  it("应忽略登出后的过期校验成功结果", async () => {
    const deferred = createDeferred<{
      status: number;
      ok: boolean;
      data: { errcode: number };
      cookies: Array<{ name: string; value: string }>;
    }>();

    useSettingStore.setState((state) => ({
      ...state,
      setting: {
        ...state.setting,
        integration: {
          ...state.setting.integration,
          weread: {
            ...state.setting.integration.weread,
            cookies: [
              { name: "wr_name", value: "旧账号" },
              { name: "wr_vid", value: "old-vid" },
            ],
          },
        },
      },
    }));

    weReadHttpRequestMock.mockReturnValueOnce(deferred.promise);

    const validation = weReadService.validateSession();
    weReadService.logout();

    deferred.resolve({
      status: 200,
      ok: true,
      data: { errcode: 0 },
      cookies: [
        { name: "wr_name", value: "旧账号" },
        { name: "wr_vid", value: "old-vid" },
      ],
    });

    await expect(validation).resolves.toBe(false);

    const { weread } = useSettingStore.getState().setting.integration;
    expect(weread.cookies).toEqual([]);
    expect(weread.sessionStatus).toBe("unknown");
    expect(weread.userInfo.isConnected).toBe(false);
  });

  it("应忽略旧会话校验失败，避免清空新的登录状态", async () => {
    const oldValidation = createDeferred<{
      status: number;
      ok: boolean;
      data: null;
      cookies: Array<{ name: string; value: string }>;
    }>();
    const newValidation = createDeferred<{
      status: number;
      ok: boolean;
      data: { errcode: number };
      cookies: Array<{ name: string; value: string }>;
    }>();

    weReadHttpRequestMock
      .mockReturnValueOnce(oldValidation.promise)
      .mockReturnValueOnce(newValidation.promise);

    useSettingStore.setState((state) => ({
      ...state,
      setting: {
        ...state.setting,
        integration: {
          ...state.setting.integration,
          weread: {
            ...state.setting.integration.weread,
            cookies: [
              { name: "wr_name", value: "旧账号" },
              { name: "wr_vid", value: "old-vid" },
            ],
          },
        },
      },
    }));

    const firstValidation = weReadService.validateSession();

    useSettingStore.setState((state) => ({
      ...state,
      setting: {
        ...state.setting,
        integration: {
          ...state.setting.integration,
          weread: {
            ...state.setting.integration.weread,
            cookies: [
              { name: "wr_name", value: "新账号" },
              { name: "wr_vid", value: "new-vid" },
            ],
          },
        },
      },
    }));

    const secondValidation = weReadService.validateSession();

    newValidation.resolve({
      status: 200,
      ok: true,
      data: { errcode: 0 },
      cookies: [
        { name: "wr_name", value: "新账号" },
        { name: "wr_vid", value: "new-vid" },
      ],
    });
    oldValidation.resolve({
      status: 401,
      ok: false,
      data: null,
      cookies: [],
    });

    await expect(secondValidation).resolves.toBe(true);
    await expect(firstValidation).resolves.toBe(false);

    const { weread } = useSettingStore.getState().setting.integration;
    expect(weread.sessionStatus).toBe("valid");
    expect(weread.cookies).toEqual([
      { name: "wr_name", value: "新账号" },
      { name: "wr_vid", value: "new-vid" },
    ]);
    expect(weread.userInfo).toEqual({
      name: "新账号",
      vid: "new-vid",
      isConnected: true,
    });
  });
});
