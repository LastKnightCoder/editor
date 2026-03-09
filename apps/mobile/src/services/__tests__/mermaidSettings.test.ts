import { describe, expect, it } from "vitest";
import type { SettingCompat } from "../../types";
import {
  DEFAULT_MERMAID_DARK_THEME,
  DEFAULT_MERMAID_LIGHT_THEME,
  DEFAULT_MERMAID_STYLE,
  DEFAULT_USE_BEAUTIFUL_MERMAID,
  getNormalizedMermaidSetting,
  patchMermaidSetting,
  withNormalizedMermaidSetting,
} from "../mermaidSettings";

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

describe("mermaidSettings", () => {
  it("空配置会回退到默认值", () => {
    const setting = createBaseSetting();
    const mermaid = getNormalizedMermaidSetting(setting);
    expect(mermaid).toEqual({
      style: DEFAULT_MERMAID_STYLE,
      lightTheme: DEFAULT_MERMAID_LIGHT_THEME,
      darkTheme: DEFAULT_MERMAID_DARK_THEME,
      useBeautifulMermaid: DEFAULT_USE_BEAUTIFUL_MERMAID,
    });
  });

  it("合法配置会保留原值", () => {
    const setting = createBaseSetting({
      misc: {
        mermaid: {
          style: "ascii-unicode",
          lightTheme: "one-dark",
          darkTheme: "dracula",
          useBeautifulMermaid: false,
        },
      },
    });
    const mermaid = getNormalizedMermaidSetting(setting);
    expect(mermaid).toEqual({
      style: "ascii-unicode",
      lightTheme: "one-dark",
      darkTheme: "dracula",
      useBeautifulMermaid: false,
    });
  });

  it("非法配置会自动回退", () => {
    const setting = createBaseSetting({
      misc: {
        mermaid: {
          style: "invalid-style",
          lightTheme: "invalid-light-theme",
          darkTheme: "github-dark",
          useBeautifulMermaid: "invalid-flag",
        },
      },
    });
    const mermaid = getNormalizedMermaidSetting(setting);
    expect(mermaid).toEqual({
      style: DEFAULT_MERMAID_STYLE,
      lightTheme: DEFAULT_MERMAID_LIGHT_THEME,
      darkTheme: "github-dark",
      useBeautifulMermaid: DEFAULT_USE_BEAUTIFUL_MERMAID,
    });
  });

  it("patch 后会保留 misc 其他字段", () => {
    const setting = createBaseSetting({
      misc: {
        keep: "keep-value",
        mermaid: {
          style: "svg",
          lightTheme: "github-light",
          darkTheme: "github-dark",
          useBeautifulMermaid: true,
        },
      },
    });
    const patched = patchMermaidSetting(setting, { style: "ascii-unicode" });
    const patchedMisc = (patched.misc ?? {}) as Record<string, unknown>;
    const patchedMermaid = (patchedMisc.mermaid ?? {}) as Record<
      string,
      unknown
    >;
    expect(patchedMisc.keep).toBe("keep-value");
    expect(patchedMermaid.style).toBe("ascii-unicode");
    expect(patchedMermaid.lightTheme).toBe("github-light");
    expect(patchedMermaid.darkTheme).toBe("github-dark");
    expect(patchedMermaid.useBeautifulMermaid).toBe(true);
  });

  it("patch 支持切换 beautiful-mermaid 开关", () => {
    const setting = createBaseSetting({
      misc: {
        mermaid: {
          style: "svg",
          lightTheme: "github-light",
          darkTheme: "github-dark",
          useBeautifulMermaid: true,
        },
      },
    });
    const patched = patchMermaidSetting(setting, {
      useBeautifulMermaid: false,
    });
    const patchedMisc = (patched.misc ?? {}) as Record<string, unknown>;
    const patchedMermaid = (patchedMisc.mermaid ?? {}) as Record<
      string,
      unknown
    >;
    expect(patchedMermaid.useBeautifulMermaid).toBe(false);
  });

  it("withNormalizedMermaidSetting 会补齐缺失的 mermaid 配置", () => {
    const setting = createBaseSetting({
      misc: {
        extra: "value",
      },
    });
    const normalized = withNormalizedMermaidSetting(setting);
    const normalizedMisc = (normalized.misc ?? {}) as Record<string, unknown>;
    expect(normalizedMisc.extra).toBe("value");
    expect(normalizedMisc.mermaid).toEqual({
      style: DEFAULT_MERMAID_STYLE,
      lightTheme: DEFAULT_MERMAID_LIGHT_THEME,
      darkTheme: DEFAULT_MERMAID_DARK_THEME,
      useBeautifulMermaid: DEFAULT_USE_BEAUTIFUL_MERMAID,
    });
  });
});
