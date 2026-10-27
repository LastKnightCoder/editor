import type { PackageContent, Submission } from "../../../../contracts";
export const content: PackageContent = {
  manifest: {
    id: "example.reader",
    name: "阅读助手",
    description: "整理阅读摘录",
    version: "1.0.0",

    formatVersion: 3,
    apiVersion: 1,
    platform: "portable" as const,
    format: "cjs",
    main: "main.js",
    integrity: { "main.js": "a".repeat(64) },

    profile: "web-v1" as const,
    targets: { desktop: { minAppVersion: "0.59.0" } },
  },
  readme: "# 阅读助手\n\n整理阅读摘录。\n\n## 使用\n\n启用插件后打开侧边栏入口。",
  changelog: null,
};
export const sampleSubmission = (): Submission => ({
  id: "demo",
  revision: 1,
  status: "draft",
  packageUploadId: null,
  content: null,
  repository: "",
  commit: null,
  repositoryId: null,
  pluginId: null,
  disabled: null,
  canEdit: true,
  owned: true,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  submittedAt: null,
  lastEvent: null,
});
