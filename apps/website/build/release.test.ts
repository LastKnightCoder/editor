import { describe, expect, it } from "vitest";
import {
  DOWNLOAD_TARGETS,
  RELEASE_BASE_URL,
  ANALYTICS_DOWNLOAD_BASE_URL,
  fetchReleaseInfo,
  parseAndroidManifest,
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
  - url: Tau-v0.59.0-darwin-x64.zip
    size: 250000000
  - url: Tau-v0.59.0-darwin-x64.dmg
    size: 255000000
  - url: Tau-v0.59.0-darwin-arm64.zip
    size: 260000000
  - url: Tau-v0.59.0-darwin-arm64.dmg
    size: 262144000
path: Tau-v0.59.0-darwin-x64.zip
releaseDate: '2026-10-20T00:00:00.000Z'
`;

// 0.57 及更早：dmg 不带架构（实际只支持 Apple 芯片）
const LEGACY_MAC_YML = `version: 0.57.2
files:
  - url: Tau-v0.57.2-darwin.zip
    size: 261279847
  - url: Tau-v0.57.2-darwin.dmg
    size: 268348222
path: Tau-v0.57.2-darwin.zip
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
  const macTargets = DOWNLOAD_TARGETS.filter(t => t.os === "mac");

  it("按芯片分别挑出 dmg，不取自动更新用的 zip", () => {
    expect(parseLatestYml(MAC_YML, macTargets).files).toEqual([
      { target: "mac-arm64", file: "Tau-v0.59.0-darwin-arm64.dmg", size: 262144000 },
      { target: "mac-x64", file: "Tau-v0.59.0-darwin-x64.dmg", size: 255000000 },
    ]);
  });

  it("已核实的 0.57.2 旧版 dmg 只归到 Apple 芯片", () => {
    expect(parseLatestYml(LEGACY_MAC_YML, macTargets).files).toEqual([
      { target: "mac-arm64", file: "Tau-v0.57.2-darwin.dmg", size: 268348222 },
    ]);
  });

  it("未知的未标架构安装包不推测芯片", () => {
    expect(parseLatestYml(LEGACY_MAC_YML.replaceAll("0.57.2", "0.59.0"), macTargets).files).toEqual([]);
  });

  it("同一份清单优先选择带架构的新包", () => {
    const mixed = MAC_YML.replaceAll("0.59.0", "0.57.2").replace("files:", "files:\n  - url: Tau-v0.57.2-darwin.dmg\n    size: 1");
    expect(parseLatestYml(mixed, macTargets).files[0].file).toBe("Tau-v0.57.2-darwin-arm64.dmg");
  });

  it("缺少 version 时报错", () => {
    expect(() => parseLatestYml("files: []", macTargets)).toThrow("version");
  });
});

const ANDROID_JSON = JSON.stringify({
  version: "0.2.5",
  releaseDate: "2026-10-24T00:00:00.000Z",
  file: "Tau-v0.2.5-android-arm64.apk",
  size: 62914560,
  sha256: "a".repeat(64),
  releaseNotes: [],
});

describe("parseAndroidManifest", () => {
  it("清单里唯一的 APK 归到 Android", () => {
    const targets = DOWNLOAD_TARGETS.filter(t => t.os === "android");
    expect(parseAndroidManifest(ANDROID_JSON, targets).files).toEqual([
      { target: "android", file: "Tau-v0.2.5-android-arm64.apk", size: 62914560 },
    ]);
  });
});

describe("fetchReleaseInfo", () => {
  it("Android 安装包与清单同目录，页面主版本仍取桌面端", async () => {
    const info = await fetchReleaseInfo(
      fakeFetch({ "desktop/latest.yml": WINDOWS_YML, "mobile/android/latest.json": ANDROID_JSON })
    );
    expect(info.version).toBe("0.58.0");
    expect(info.targets.find(t => t.target === "android")).toEqual({
      target: "android",
      url: `${RELEASE_BASE_URL}/mobile/android/Tau-v0.2.5-android-arm64.apk`,
      size: 62914560,
      version: "0.2.5",
    });
    expect(renderReleaseMeta(info)).toBe(
      "v0.58.0 · 2026.10.15 发布 · Windows 约 233 MB · Android v0.2.5 约 60 MB"
    );
    expect(renderDownloadButtons(info)).toContain(
      `href="${RELEASE_BASE_URL}/mobile/android/Tau-v0.2.5-android-arm64.apk"`
    );
  });

  it("未发布的平台缺席，不影响其他平台", async () => {
    const info = await fetchReleaseInfo(fakeFetch({ "desktop/latest.yml": WINDOWS_YML }));
    expect(info.version).toBe("0.58.0");
    expect(info.targets).toEqual([
      {
        target: "windows",
        url: `${RELEASE_BASE_URL}/desktop/Tau-v0.58.0-win32.exe`,
        size: 243982579,
        version: "0.58.0",
      },
    ]);
  });

  it("各平台版本不一致时展示较新的版本号", async () => {
    const info = await fetchReleaseInfo(
      fakeFetch({ "desktop/latest.yml": WINDOWS_YML, "desktop/latest-mac.yml": MAC_YML })
    );
    expect(info.version).toBe("0.59.0");
    expect(info.targets.map(t => t.target)).toEqual(["mac-arm64", "mac-x64", "windows"]);
  });

  it("Mac 旧版包保留 Apple 芯片下载，不误标为 Intel", async () => {
    const info = await fetchReleaseInfo(
      fakeFetch({ "desktop/latest.yml": WINDOWS_YML, "desktop/latest-mac.yml": LEGACY_MAC_YML })
    );
    expect(info.version).toBe("0.58.0");
    expect(info.targets.map(t => t.target)).toEqual(["mac-arm64", "windows"]);
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
    const info = await fetchReleaseInfo(fakeFetch({ "desktop/latest.yml": WINDOWS_YML }));
    const html = renderDownloadButtons(info);
    expect(html).toContain("macOS 版即将推出");
    expect(html).toMatch(/class="btn primary" data-target="windows"/);
    expect(html).toContain(`${ANALYTICS_DOWNLOAD_BASE_URL}/Tau-v0.58.0-win32.exe?channel=website`);
    expect(html).not.toContain(`href="${RELEASE_BASE_URL}`);
  });

  it("mac 两种芯片各一个按钮，Apple 芯片在前且为主按钮", async () => {
    const info = await fetchReleaseInfo(
      fakeFetch({ "desktop/latest.yml": WINDOWS_YML, "desktop/latest-mac.yml": MAC_YML })
    );
    const html = renderDownloadButtons(info);
    expect(html).toMatch(/class="btn primary" data-target="mac-arm64"/);
    expect(html).toMatch(/class="btn ghost" data-target="mac-x64"/);
    expect(html).toContain(
      `${ANALYTICS_DOWNLOAD_BASE_URL}/Tau-v0.59.0-darwin-x64.dmg?channel=website`
    );
    expect(html).not.toContain("macOS 版即将推出");
    expect(renderReleaseMeta(info)).toBe(
      "v0.59.0 · 2026.10.20 发布 · macOS 约 250 MB · Windows 约 233 MB"
    );
  });

  it("只发布一种 Mac 芯片时，另一种明确显示即将推出", async () => {
    for (const target of ["mac-arm64", "mac-x64"] as const) {
      const other = target === "mac-arm64" ? "mac-x64" : "mac-arm64";
      const html = renderDownloadButtons({
        version: "0.59.0",
        releaseDate: "",
        targets: [
          {
            target,
            url: `${RELEASE_BASE_URL}/desktop/Tau-v0.59.0-darwin-${target.slice(4)}.dmg`,
            size: 1,
            version: "0.59.0",
          },
        ],
      });
      expect(html).toMatch(new RegExp(`<a class="btn primary" data-target="${target}"`));
      expect(html).toMatch(new RegExp(`<span[^>]+data-target="${other}"[^>]+aria-disabled="true"`));
    }
  });

  it("元信息包含版本、日期与大小", async () => {
    const info = await fetchReleaseInfo(fakeFetch({ "desktop/latest.yml": WINDOWS_YML }));
    expect(renderReleaseMeta(info)).toBe("v0.58.0 · 2026.10.15 发布 · Windows 约 233 MB");
  });
});
