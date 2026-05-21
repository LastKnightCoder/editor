import { describe, expect, it } from "vitest";
import useSettingStore, {
  buildPersistedSettingSnapshot,
} from "../useSettingStore";

describe("useSettingStore persistence snapshot", () => {
  it("应保留 WeRead API Key，并在未配置时重置运行时连接状态", () => {
    const setting = structuredClone(useSettingStore.getState().setting);
    setting.integration.weread = {
      ...setting.integration.weread,
      enabled: true,
      apiKey: "",
      connectionStatus: "valid",
      lastValidatedAt: 456,
      statusReason: "should reset",
      userInfo: {
        isConnected: true,
      },
    };

    const persisted = buildPersistedSettingSnapshot(setting);

    expect(persisted.integration.weread).toEqual({
      ...setting.integration.weread,
      enabled: false,
      connectionStatus: "unknown",
      lastValidatedAt: 0,
      statusReason: "",
      userInfo: {
        isConnected: false,
      },
    });
  });

  it("已配置 API Key 时也不应持久化 WeRead 运行时连接状态", () => {
    const setting = structuredClone(useSettingStore.getState().setting);
    setting.integration.weread = {
      ...setting.integration.weread,
      enabled: true,
      apiKey: "wrk-test-key",
      connectionStatus: "valid",
      lastValidatedAt: 456,
      statusReason: "runtime status",
      userInfo: {
        isConnected: true,
      },
    };

    const persisted = buildPersistedSettingSnapshot(setting);

    expect(persisted.integration.weread).toEqual({
      ...setting.integration.weread,
      enabled: true,
      connectionStatus: "unknown",
      lastValidatedAt: 0,
      statusReason: "",
      userInfo: {
        isConnected: false,
      },
    });
  });
});
