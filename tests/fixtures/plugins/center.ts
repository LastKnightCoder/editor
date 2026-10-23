import type { CenterHost, CenterRelease } from "../../../packages/plugins/src/center";

export const centerHost: CenterHost = {
  platform: "android",
  appVersion: "1.0.0",
  apiVersions: [1],
  formatVersions: [3],
  profiles: ["web-v1"],
  capabilities: ["pages.v1", "navigation.v1"],
};
export function centerRelease(version = "1.0.0", releaseId = "release-1"): CenterRelease {
  const targets = {
    android: {
      minAppVersion: "0.2.0",
      required: ["pages.v1" as const],
      optional: ["ui.dialog.v1" as const],
    },
  };
  return {
    pluginId: "example.counter",
    releaseId,
    version,
    formatVersion: 3,
    apiVersion: 1,
    profile: "web-v1",
    targets,
    publishedAt: "2026-10-23T00:00:00Z",
    size: 100,
    sha256: "a".repeat(64),
    downloadUrl: `https://example.invalid/v2/releases/${releaseId}/download`,
    content: {
      manifest: {
        id: "example.counter",
        name: "计数器",
        description: "跨端计数器测试包",
        version,
        formatVersion: 3,
        apiVersion: 1,
        platform: "portable",
        profile: "web-v1",
        targets,
        format: "cjs",
        main: "main.js",
        integrity: { "main.js": "b".repeat(64) },
        categories: ["page"],
      },
      readme: "测试资料",
      changelog: null,
    },
    publisher: { login: "fixture", avatarUrl: "" },
    repository: "https://example.invalid/source",
    commit: "fixture-commit",
    systemReviewed: false,
  };
}
