import { describe, expect, it } from "vitest";

import { getBlogImageAppearance } from "./editorRegistry";

describe("blog/editorRegistry", () => {
  it("应优先读取发布页注入的图片外观 setting", () => {
    const appearance = getBlogImageAppearance({
      appearance: {
        image: {
          borderRadius: "lg",
          shadow: "md",
        },
      },
    });

    expect(appearance.borderRadius).toBe("lg");
    expect(appearance.shadow).toBe("md");
  });

  it("缺少发布 setting 时应回退到温和圆角和无阴影", () => {
    const appearance = getBlogImageAppearance();

    expect(appearance.borderRadius).toBe("md");
    expect(appearance.shadow).toBe("none");
  });
});
