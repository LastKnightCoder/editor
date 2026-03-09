import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SettingCompat } from "../../types";
import { createMobileEditorServices } from "../editorServices";
import { setMobileSettingSnapshot } from "../mobileSettingsBridge";

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

describe("mobile editorServices settings bridge", () => {
  beforeEach(() => {
    setMobileSettingSnapshot(null);
  });

  it("未设置快照时 get 返回 undefined", () => {
    const services = createMobileEditorServices();
    expect(services.settings.get("database.active")).toBeUndefined();
    expect(services.settings.get("misc.mermaid.style")).toBeUndefined();
  });

  it("设置快照更新后可读取最新路径值", () => {
    const services = createMobileEditorServices();
    setMobileSettingSnapshot(
      createBaseSetting({
        misc: {
          mermaid: {
            style: "ascii-unicode",
            lightTheme: "one-dark",
            darkTheme: "dracula",
          },
        },
      }),
    );
    expect(services.settings.get("database.active")).toBe("data.db");
    expect(services.settings.get("misc.mermaid.style")).toBe("ascii-unicode");
    expect(services.settings.get("misc.mermaid.lightTheme")).toBe("one-dark");
    expect(services.settings.get("misc.mermaid.darkTheme")).toBe("dracula");
    expect(services.settings.get("misc.mermaid.useBeautifulMermaid")).toBe(
      undefined,
    );
  });

  it("设置快照显式关闭 beautiful-mermaid 后可读取开关值", () => {
    const services = createMobileEditorServices();
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
      }),
    );

    expect(services.settings.get("misc.mermaid.useBeautifulMermaid")).toBe(
      false,
    );
  });

  it("subscribe 会在设置快照变化时触发", () => {
    const services = createMobileEditorServices();
    const listener = vi.fn();
    const unsubscribe = services.settings.subscribe?.(listener);
    expect(typeof unsubscribe).toBe("function");

    setMobileSettingSnapshot(createBaseSetting());
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe?.();
    setMobileSettingSnapshot(createBaseSetting({ misc: { mermaid: {} } }));
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
