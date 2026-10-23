import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../EditorLabPage", () => ({ EditorLabPage: () => null }));

async function loadRegistry() {
  vi.resetModules();
  const pageModule = await import("../pages/editorLab.page");
  const { getPageDefinition } = await import("../../../router");
  return { pageModule, getPageDefinition };
}

describe("editorLab 页面注册", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("开发构建注册 editorLab", async () => {
    vi.stubEnv("DEV", true);
    const { pageModule, getPageDefinition } = await loadRegistry();
    expect(pageModule.default).not.toBeNull();
    expect(getPageDefinition("editorLab")).toBeDefined();
  });

  it("生产构建不注册 editorLab", async () => {
    vi.stubEnv("DEV", false);
    const { pageModule, getPageDefinition } = await loadRegistry();
    expect(pageModule.default).toBeNull();
    expect(getPageDefinition("editorLab")).toBeUndefined();
  });
});
