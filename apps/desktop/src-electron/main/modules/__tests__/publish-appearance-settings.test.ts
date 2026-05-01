import { describe, expect, it } from "vitest";

import {
  attachPublishAppearanceSettings,
  buildPublishAppearanceSettings,
} from "../publish-appearance-settings";

describe("publish-appearance-settings", () => {
  it("应只保留发布所需的图片外观 setting", () => {
    const settings = buildPublishAppearanceSettings({
      appearance: {
        image: {
          borderRadius: "lg",
          shadow: "sm",
        },
      },
    });

    expect(settings).toEqual({
      appearance: {
        image: {
          borderRadius: "lg",
          shadow: "sm",
        },
      },
    });
  });

  it("挂载到 init data 时应补齐默认圆角并保留无阴影", () => {
    const initData = attachPublishAppearanceSettings(
      {
        site: {
          title: "站点",
          description: "",
          basePath: "/",
        },
        navigation: [],
        content: {},
        meta: {
          type: "article",
          publishTime: 1,
        },
      },
      undefined,
    );

    expect(initData.settings).toEqual({
      appearance: {
        image: {
          borderRadius: "md",
          shadow: "none",
        },
      },
    });
  });
});
