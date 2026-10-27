import { describe, expect, it } from "vitest";
import { centerHost, centerRelease } from "../../../../tests/fixtures/plugins/center";
import {
  centerManifestTargets,
  evaluateCenterCompatibility,
  normalizeCenterQuery,
  describeCenterPermissions,
  resolveCenterRelease,
} from "../center";

describe("平台感知分发契约", () => {
  it("安装只按平台与版本选版，不另比较能力标签", () => {
    const release = centerRelease();
    expect(resolveCenterRelease([release], { host: centerHost })).toMatchObject({
      release: { releaseId: release.releaseId },
      compatibility: { status: "compatible" },
    });
  });
  it("权限说明保留原始码、去重并标记新增声明，未知权限不隐藏", () => {
    expect(
      describeCenterPermissions(
        ["cards:read", "cards:write", "cards:write", "future:read"],
        ["cards:read"]
      )
    ).toEqual([
      { permission: "cards:read", label: "读取卡片", newlyRequested: false },
      { permission: "cards:write", label: "新增和修改卡片", newlyRequested: true },
      { permission: "future:read", label: "future:read", newlyRequested: true },
    ]);
  });
  it("无真实宿主时明确未检查，不把浏览平台当作可安装", () => {
    expect(evaluateCenterCompatibility(centerRelease())).toEqual({
      status: "unchecked",
      reasons: [],
    });
  });
  it.each([
    [{ ...centerHost, platform: "ios" as const }, "PLATFORM_UNSUPPORTED"],
    [{ ...centerHost, appVersion: "0.1.0" }, "APP_VERSION_TOO_LOW"],
    [{ ...centerHost, formatVersions: [1] }, "FORMAT_UNSUPPORTED"],
    [{ ...centerHost, apiVersions: [2] }, "API_UNSUPPORTED"],
    [{ ...centerHost, profiles: [] }, "PROFILE_UNSUPPORTED"],
  ])("按宿主条件返回结构化拒绝原因", (host, code) => {
    expect(evaluateCenterCompatibility(centerRelease(), host)).toMatchObject({
      status: "incompatible",
      reasons: expect.arrayContaining([expect.objectContaining({ code })]),
    });
  });
  it("选最高兼容版本而非最新发布时间；指定不兼容版本不能换成其他版本", () => {
    const older = centerRelease();
    const newer = centerRelease("2.0.0", "release-2");
    newer.targets = { ios: { minAppVersion: "0.2.0" } };
    expect(resolveCenterRelease([newer, older], { host: centerHost }).release?.releaseId).toBe(
      older.releaseId
    );
    expect(
      resolveCenterRelease([newer, older], { host: centerHost, releaseId: newer.releaseId }).release
    ).toBeNull();
    expect(resolveCenterRelease([], { host: centerHost })).toMatchObject({
      release: null,
      compatibility: { reasons: [{ code: "NO_RELEASE" }] },
    });
  });
  it("旧格式只投影桌面目标，即使客户端声称支持旧格式也不能在手机安装", () => {
    const manifest = {
      formatVersion: 1 as const,
      apiVersion: 1 as const,
      platform: "desktop" as const,
      id: "old.plugin",
      name: "旧插件",
      description: "旧包",
      version: "1.0.0",
      minAppVersion: "0.59.0",
      template: { protocolVersion: 1 as const, root: "site", entries: ["index.html"] },
      integrity: {},
    };
    expect(Object.keys(centerManifestTargets(manifest))).toEqual(["desktop"]);
    expect(
      evaluateCenterCompatibility(
        { ...centerRelease(), formatVersion: 1, profile: null },
        { ...centerHost, formatVersions: [1] }
      ).status
    ).toBe("incompatible");
  });
  it("查询规范化保留完整宿主差异，集合顺序不影响缓存键", () => {
    const input = {
      platform: "android" as const,
      q: " Counter ",
      host: { ...centerHost },
    };
    expect(normalizeCenterQuery(input)).toEqual(
      normalizeCenterQuery({
        ...input,
        q: "counter",
        host: { ...centerHost },
      })
    );
    expect(normalizeCenterQuery(input)).not.toEqual(
      normalizeCenterQuery({ ...input, host: { ...centerHost, appVersion: "9.0.0" } })
    );
    expect(() => normalizeCenterQuery({ ...input, platform: "all" })).toThrow("不一致");
    expect(() => normalizeCenterQuery({ ...input, platform: "ios" })).toThrow("不一致");
    expect(() => normalizeCenterQuery({ ...input, limit: 51 })).toThrow("分页");
  });
});
