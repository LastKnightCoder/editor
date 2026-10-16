import {
  emptyListing,
  type PackageManifest,
  type Submission,
  type Upload,
  type User,
} from "../../../../contracts";

/** 模拟模式的持久数据（localStorage），刷新后保持，用于演示刷新恢复 */
export interface MockDb {
  user: User | null;
  submissions: Submission[];
  uploads: Upload[];
  /** clientRequestId → submissionId，模拟服务端幂等 */
  requests: Record<string, string>;
  seq: number;
}

export const MOCK_USER: User = {
  id: "10001",
  login: "tau-author",
  avatarUrl: "",
};

export function sampleManifest(id: string, name: string, version: string): PackageManifest {
  return {
    formatVersion: 1,
    apiVersion: 1,
    id,
    name,
    version,
    minAppVersion: "0.40.0",
    platform: "desktop",
    format: "cjs",
    main: "main.js",
    styles: "styles.css",
    integrity: {
      "manifest.json": "sha256-" + "1".repeat(43) + "=",
      "main.js": "sha256-" + "2".repeat(43) + "=",
      "styles.css": "sha256-" + "3".repeat(43) + "=",
    },
  };
}

const sha = (seed: string) => seed.repeat(64).slice(0, 64);

function readyUpload(
  id: string,
  kind: Upload["kind"],
  fileName: string,
  size: number,
  createdAt: string,
  manifest: PackageManifest | null = null
): Upload {
  return {
    id,
    kind,
    status: "ready",
    fileName,
    size,
    sha256: sha(id.slice(-1)),
    manifest,
    error: null,
    createdAt,
  };
}

/**
 * 状态样本：
 * - 可提交草稿（包、图标、两张截图、资料齐全）
 * - 半成品草稿（缺图标，commit 未写完整）
 * - 刚创建的空草稿
 * - 待审核（只读）
 */
export function createSampleDb(now = new Date()): MockDb {
  const at = (minutesAgo: number) => new Date(now.getTime() - minutesAgo * 60_000).toISOString();
  const pomodoro = sampleManifest("pomodoro-plus", "番茄钟增强", "1.2.0");
  const weread = sampleManifest("weread-sync", "微信读书摘录", "0.4.0");
  const outline = sampleManifest("outline-tools", "大纲工具箱", "0.1.0");

  const uploads: Upload[] = [
    readyUpload(
      "upl_sample_pkg_1",
      "package",
      "pomodoro-plus-1.2.0.zip",
      182_304,
      at(80),
      pomodoro
    ),
    readyUpload("upl_sample_icon_1", "icon", "icon.png", 12_480, at(79)),
    readyUpload("upl_sample_shot_1", "screenshot", "timer.png", 402_112, at(78)),
    readyUpload("upl_sample_shot_2", "screenshot", "stats.png", 388_020, at(78)),
    readyUpload("upl_sample_pkg_2", "package", "weread-sync-0.4.0.zip", 241_664, at(3000), weread),
    readyUpload("upl_sample_icon_2", "icon", "weread.png", 9_870, at(3000)),
    readyUpload("upl_sample_pkg_3", "package", "outline-tools-0.1.0.zip", 64_212, at(200), outline),
  ];

  const submissions: Submission[] = [
    {
      id: "sub_0004",
      revision: 1,
      status: "draft",
      packageUploadId: null,
      manifest: null,
      listing: emptyListing(),
      repositoryId: null,
      createdAt: at(5),
      updatedAt: at(5),
      submittedAt: null,
    },
    {
      id: "sub_0003",
      revision: 3,
      status: "draft",
      packageUploadId: "upl_sample_pkg_1",
      manifest: pomodoro,
      listing: {
        summary: "在 Tau 中专注计时，自动记录番茄与统计。",
        description:
          "## 功能\n\n- 自定义专注与休息时长\n- 每日统计与**连续天数**\n- 结束时提醒，可跳过休息\n\n> 第一版只支持桌面端。\n\n设置入口位于 `设置 → 插件 → 番茄钟增强`。原始 HTML 不会执行：<script>alert(1)</script>",
        repository: "https://github.com/tau-author/pomodoro-plus",
        commit: "4f2c1d9e8b7a6f5e4d3c2b1a0f9e8d7c6b5a4f3e",
        changelog: "- 新增每日统计\n- 修复跨日计时偏差",
        supportUrl: "https://github.com/tau-author/pomodoro-plus/issues",
        iconUploadId: "upl_sample_icon_1",
        screenshotUploadIds: ["upl_sample_shot_1", "upl_sample_shot_2"],
      },
      repositoryId: null,
      createdAt: at(90),
      updatedAt: at(40),
      submittedAt: null,
    },
    {
      id: "sub_0002",
      revision: 2,
      status: "draft",
      packageUploadId: "upl_sample_pkg_3",
      manifest: outline,
      listing: {
        ...emptyListing(),
        summary: "把长文档整理成可折叠大纲。",
        description: "早期版本，介绍待补充。",
        repository: "https://github.com/tau-author/outline-tools",
        commit: "9a8b7c6",
      },
      repositoryId: null,
      createdAt: at(220),
      updatedAt: at(200),
      submittedAt: null,
    },
    {
      id: "sub_0001",
      revision: 5,
      status: "pending_review",
      packageUploadId: "upl_sample_pkg_2",
      manifest: weread,
      listing: {
        summary: "同步微信读书划线与想法到 Tau 摘录。",
        description:
          "## 使用\n\n1. 在插件设置中扫码登录微信读书\n2. 选择要同步的书架\n3. 摘录会按书籍归档\n\n详见 [使用说明](https://github.com/tau-author/weread-sync#readme)。",
        repository: "https://github.com/tau-author/weread-sync",
        commit: "0123456789abcdef0123456789abcdef01234567",
        changelog: "首次提交。",
        supportUrl: "https://github.com/tau-author/weread-sync/issues",
        iconUploadId: "upl_sample_icon_2",
        screenshotUploadIds: [],
      },
      repositoryId: "repo_8812",
      createdAt: at(3100),
      updatedAt: at(2900),
      submittedAt: at(2900),
    },
  ];

  return { user: MOCK_USER, submissions, uploads, requests: {}, seq: 5 };
}

/** 样本图片：模拟模式无真实图片时的占位内容 */
export function sampleImageSvg(label: string, wide: boolean): string {
  const [w, h] = wide ? [640, 400] : [256, 256];
  const text = label.slice(0, 12).replace(/[<>&"']/g, "");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><rect width="100%" height="100%" fill="#ece6d8"/><text x="50%" y="50%" fill="#7a6f5c" font-family="sans-serif" font-size="${wide ? 28 : 40}" text-anchor="middle" dominant-baseline="middle">${text}</text></svg>`;
}
