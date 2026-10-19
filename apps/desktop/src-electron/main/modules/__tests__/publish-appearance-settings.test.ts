import { describe, expect, it } from "vitest";

import { buildPublishAppearanceSettings } from "../publish-appearance-settings";

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

  it("未设置时应补齐默认圆角并保留无阴影", () => {
    expect(buildPublishAppearanceSettings(undefined)).toEqual({
      appearance: {
        image: {
          borderRadius: "md",
          shadow: "none",
        },
      },
    });
  });
});
