import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SettingCompat } from "../../types";
import { createMobileEditorConfig } from "../editorRegistry";
import {
  getMobileSettingByPath,
  setMobileSettingSnapshot,
  subscribeMobileSettingSnapshot,
} from "../mobileSettingsBridge";

function createBaseSetting(overrides?: Record<string, unknown>): SettingCompat {
  const base: SettingCompat = {
    database: {
      active: "data.db",
      databases: [],
    },
    imageBed: {
      active: "github",
      enableCompression: false,
      github: {
        repo: "",
        branch: "",
        cdn: null,
        pathPrefix: "",
      },
      aliOSS: {
        bucket: "",
        region: "",
        pathPrefix: "",
      },
      local: {
        path: "resources",
      },
      s3: {
        bucket: "",
        region: "",
        pathPrefix: "",
      },
      webdav: {
        pathPrefix: "",
      },
    },
    sync: {
      active: "aliOSS",
      webdav: {
        pathPrefix: "",
      },
      aliOSS: {
        bucket: "",
        region: "",
        path: "/",
      },
      s3: {
        bucket: "",
        region: "",
        pathPrefix: "",
      },
      github: {
        repo: "",
        branch: "",
        pathPrefix: "",
      },
    },
    integration: {
      github: {
        token: "",
        user: {
          name: "",
          email: "",
        },
      },
      s3: {
        accessKeyId: "",
        secretAccessKey: "",
        endpoint: "",
        urlStyle: "path",
      },
      webdav: {
        url: "",
        username: "",
        password: "",
      },
      aliOSS: {
        accessKeyId: "",
        accessKeySecret: "",
      },
    },
  };
  if (!overrides) {
    return base;
  }
  return {
    ...base,
    ...(overrides as SettingCompat),
  };
}

describe("mobile settings bridge 与编辑器配置", () => {
  beforeEach(() => {
    setMobileSettingSnapshot(null);
  });

  it("未设置快照时按路径读取返回 undefined", () => {
    expect(getMobileSettingByPath("database.active")).toBeUndefined();
    expect(getMobileSettingByPath("misc.mermaid.style")).toBeUndefined();
  });

  it("设置快照更新后可读取最新路径值", () => {
    setMobileSettingSnapshot(
      createBaseSetting({
        misc: {
          mermaid: {
            style: "ascii-unicode",
            lightTheme: "one-dark",
            darkTheme: "dracula",
          },
        },
      })
    );
    expect(getMobileSettingByPath("database.active")).toBe("data.db");
    expect(getMobileSettingByPath("misc.mermaid.style")).toBe("ascii-unicode");
    expect(getMobileSettingByPath("misc.mermaid.lightTheme")).toBe("one-dark");
    expect(getMobileSettingByPath("misc.mermaid.darkTheme")).toBe("dracula");
    expect(getMobileSettingByPath("misc.mermaid.useBeautifulMermaid")).toBe(undefined);
  });

  it("设置快照显式关闭 beautiful-mermaid 后可读取开关值", () => {
    setMobileSettingSnapshot(
      createBaseSetting({
        misc: {
          mermaid: {
            style: "svg",
            lightTheme: "github-light",
            darkTheme: "github-dark",
            useBeautifulMermaid: false,
          },
        },
      })
    );

    expect(getMobileSettingByPath("misc.mermaid.useBeautifulMermaid")).toBe(false);
  });

  it("编辑器配置的 mermaid 字段来自设置桥快照", () => {
    setMobileSettingSnapshot(
      createBaseSetting({
        misc: {
          mermaid: {
            style: "ascii-unicode",
            lightTheme: "one-dark",
            darkTheme: "dracula",
          },
        },
      })
    );

    const config = createMobileEditorConfig();
    expect(config.mermaid?.style).toBe("ascii-unicode");
    expect(config.mermaid?.lightTheme).toBe("one-dark");
    expect(config.mermaid?.darkTheme).toBe("dracula");
  });

  it("subscribe 会在设置快照变化时触发", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeMobileSettingSnapshot(listener);
    expect(typeof unsubscribe).toBe("function");

    setMobileSettingSnapshot(createBaseSetting());
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
    setMobileSettingSnapshot(createBaseSetting({ misc: { mermaid: {} } }));
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
