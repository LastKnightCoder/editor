import { describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({
  ipcMain: {
    handle: vi.fn(),
  },
}));

vi.mock("electron-log", () => ({
  default: {
    info: vi.fn(),
    error: vi.fn(),
  },
}));

import RssDiscoveryModule from "../rss-discovery";
import { buildBilibiliUserDynamicUrl } from "../rss-bilibili";

describe("rss-discovery", () => {
  it("B 站 UP 主空间链接应发现为动态订阅源", async () => {
    await expect(
      RssDiscoveryModule.discoverFeeds("https://space.bilibili.com/342646"),
    ).resolves.toEqual([
      {
        url: buildBilibiliUserDynamicUrl("342646"),
        title: "Bilibili UP 342646 动态",
        type: "rss",
      },
    ]);
  });
});
