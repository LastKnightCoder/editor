import { afterEach, describe, expect, it } from "vitest";

import { createBlogEditorServices } from "./editorServices";

describe("blog/editorServices", () => {
  afterEach(() => {
    document.documentElement.removeAttribute("data-theme");
    document.documentElement.classList.remove("dark");
  });

  it("应优先读取发布页注入的图片外观 setting", () => {
    const services = createBlogEditorServices({
      appearance: {
        image: {
          borderRadius: "lg",
          shadow: "md",
        },
      },
    });

    expect(services.settings.get("appearance.image.borderRadius")).toBe("lg");
    expect(services.settings.get("appearance.image.shadow")).toBe("md");
  });

  it("缺少发布 setting 时应回退到温和圆角和无阴影", () => {
    const services = createBlogEditorServices();

    expect(services.settings.get("appearance.image.borderRadius")).toBe("md");
    expect(services.settings.get("appearance.image.shadow")).toBe("none");
  });

  it("暗色主题下应正确返回主题状态", () => {
    document.documentElement.setAttribute("data-theme", "dark");
    document.documentElement.classList.add("dark");

    const services = createBlogEditorServices();

    expect(services.settings.isDarkMode()).toBe(true);
    expect(services.theme.current()).toBe("dark");
  });

  it("亮色主题下应正确返回主题状态", () => {
    document.documentElement.setAttribute("data-theme", "light");
    document.documentElement.classList.remove("dark");

    const services = createBlogEditorServices();

    expect(services.settings.isDarkMode()).toBe(false);
    expect(services.theme.current()).toBe("light");
  });
});
