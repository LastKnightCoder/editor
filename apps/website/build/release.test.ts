import { describe, expect, it } from "vitest";
import {
  RELEASE_BASE_URL,
  ANALYTICS_DOWNLOAD_BASE_URL,
  fetchReleaseInfo,
  parseLatestYml,
  renderDownloadButtons,
  renderReleaseMeta,
} from "./release.ts";

const WINDOWS_YML = `version: 0.58.0
files:
  - url: Tau-v0.58.0-win32.exe
    sha512: abc
    size: 243982579
path: Tau-v0.58.0-win32.exe
sha512: abc
releaseDate: '2026-10-15T05:47:31.677Z'
releaseNotes: [{"version":"0.58.0","note":"……"}]
`;
const MAC_YML = `version: 0.59.0
files:
  - url: Tau-v0.59.0-darwin.zip
    size: 260000000
  - url: Tau-v0.59.0-darwin.dmg
    size: 262144000
path: Tau-v0.59.0-darwin.zip
releaseDate: '2026-10-20T00:00:00.000Z'
`;
function fakeFetch(feeds: Record<string, string>) {
  return async (url: string) => {
    const name = url.slice(RELEASE_BASE_URL.length + 1);
    const body = feeds[name];
    return {
      ok: body !== undefined,
      status: body === undefined ? 404 : 200,
      text: async () => body ?? "",
    };
  };
}
describe("parseLatestYml", () => {
  it("优先取安装包而不是自动更新用的 zip", () => {
    expect(parseLatestYml(MAC_YML, /\.dmg$/)).toMatchObject({
      file: "Tau-v0.59.0-darwin.dmg",
      size: 262144000,
    });
  });
  it("缺少 version 时报错", () => {
    expect(() => parseLatestYml("files: []", /\.exe$/)).toThrow("version");
  });
});
describe("fetchReleaseInfo", () => {
  it("未发布的平台缺席，不影响其他平台", async () => {
    const info = await fetchReleaseInfo(fakeFetch({ "latest.yml": WINDOWS_YML }));
    expect(info.version).toBe("0.58.0");
    expect(info.platforms).toEqual([
      { os: "windows", url: `${RELEASE_BASE_URL}/Tau-v0.58.0-win32.exe`, size: 243982579 },
    ]);
  });
  it("各平台版本不一致时展示较新的版本号", async () => {
    const info = await fetchReleaseInfo(
      fakeFetch({ "latest.yml": WINDOWS_YML, "latest-mac.yml": MAC_YML })
    );
    expect(info.version).toBe("0.59.0");
    expect(info.platforms.map(p => p.os)).toEqual(["mac", "windows"]);
  });
  it("一个平台都没有时报错，避免发布空的下载区", async () => {
    await expect(fetchReleaseInfo(fakeFetch({}))).rejects.toThrow("没有任何平台");
  });
  it("发布源异常（非 404）时报错", async () => {
    const failing = async () => ({ ok: false, status: 500, text: async () => "" });
    await expect(fetchReleaseInfo(failing)).rejects.toThrow("HTTP 500");
  });
});
describe("渲染", () => {
  it("未发布平台显示即将推出，第一个已发布平台为主按钮", async () => {
    const info = await fetchReleaseInfo(fakeFetch({ "latest.yml": WINDOWS_YML }));
    const html = renderDownloadButtons(info);
    expect(html).toContain("macOS 版即将推出");
    expect(html).toMatch(/class="btn primary" data-os="windows"/);
    expect(html).toContain(`${ANALYTICS_DOWNLOAD_BASE_URL}/Tau-v0.58.0-win32.exe?channel=website`);
    expect(html).not.toContain(`href="${RELEASE_BASE_URL}`);
  });
  it("元信息包含版本、日期与大小", async () => {
    const info = await fetchReleaseInfo(fakeFetch({ "latest.yml": WINDOWS_YML }));
    expect(renderReleaseMeta(info)).toBe("v0.58.0 · 2026.10.15 发布 · Windows 约 233 MB");
  });
});
