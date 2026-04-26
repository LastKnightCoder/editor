import { afterEach, describe, expect, it, vi } from "vitest";

describe("markdown node import", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("应可在无 document 的 Node 环境中导入", async () => {
    vi.stubGlobal("window", undefined);
    vi.stubGlobal("document", undefined);
    vi.stubGlobal("HTMLElement", undefined);

    await expect(import("../markdown")).resolves.toBeTruthy();
  });
});
