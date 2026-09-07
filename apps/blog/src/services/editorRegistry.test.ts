import { afterEach, describe, expect, it } from "vitest";

import { createBlogEditorConfig } from "./editorRegistry";

describe("blog/editorRegistry", () => {
  afterEach(() => {
    document.documentElement.removeAttribute("data-theme");
    document.documentElement.classList.remove("dark");
  });

  it("应优先读取发布页注入的图片外观 setting", () => {
    const config = createBlogEditorConfig({
      appearance: {
        image: {
          borderRadius: "lg",
          shadow: "md",
        },
      },
    });

    expect(config.appearance?.image?.borderRadius).toBe("lg");
    expect(config.appearance?.image?.shadow).toBe("md");
  });

  it("缺少发布 setting 时应回退到温和圆角和无阴影", () => {
    const config = createBlogEditorConfig();

    expect(config.appearance?.image?.borderRadius).toBe("md");
    expect(config.appearance?.image?.shadow).toBe("none");
  });

  it("暗色主题下应正确返回主题状态", () => {
    document.documentElement.setAttribute("data-theme", "dark");
    document.documentElement.classList.add("dark");

    const config = createBlogEditorConfig();

    expect(config.theme.mode).toBe("dark");
  });

  it("亮色主题下应正确返回主题状态", () => {
    document.documentElement.setAttribute("data-theme", "light");
    document.documentElement.classList.remove("dark");

    const config = createBlogEditorConfig();

    expect(config.theme.mode).toBe("light");
  });

  it("显式传入主题时应覆盖文档主题", () => {
    document.documentElement.setAttribute("data-theme", "light");

    expect(createBlogEditorConfig(undefined, "dark").theme.mode).toBe("dark");
  });
});
