import { describe, expect, it } from "vitest";
import useSettingStore, {
  buildPersistedSettingSnapshot,
} from "../useSettingStore";

describe("useSettingStore persistence snapshot", () => {
  it("应剥离 WeRead 的运行时状态并从 Cookie 派生用户信息", () => {
    const setting = structuredClone(useSettingStore.getState().setting);
    setting.integration.weread = {
      ...setting.integration.weread,
      enabled: true,
      cookies: [
        { name: "wr_name", value: "God%20is%20a%20girl" },
        { name: "wr_vid", value: "vid-1" },
      ],
      lastCookieTime: 123,
      sessionStatus: "valid",
      lastValidatedAt: 456,
      statusReason: "should reset",
      userInfo: {
        name: "错误名称",
        vid: "错误 vid",
        isConnected: false,
      },
    };

    const persisted = buildPersistedSettingSnapshot(setting);

    expect(persisted.integration.weread).toEqual({
      ...setting.integration.weread,
      enabled: true,
      cookies: [
        { name: "wr_name", value: "God%20is%20a%20girl" },
        { name: "wr_vid", value: "vid-1" },
      ],
      lastCookieTime: 0,
      sessionStatus: "unknown",
      lastValidatedAt: 0,
      statusReason: "",
      userInfo: {
        name: "God is a girl",
        vid: "vid-1",
        isConnected: true,
      },
    });
  });
});
