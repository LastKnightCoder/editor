/**
 * 下载信息：读取 dl.taunote.app 上桌面 electron-updater 的 latest*.yml 与 Android 的 latest.json。
 * 构建时生成回退快照，Pages 在每次访问首页时用实时清单更新版本与下载入口。
 */
import { parse } from "yaml";

export const RELEASE_BASE_URL = "https://dl.taunote.app";
export const ANALYTICS_DOWNLOAD_BASE_URL = "https://analytics.taunote.app/v1/downloads";

export type PlatformKey = "mac" | "windows" | "android";
export type ArchKey = "arm64" | "x64";

/** 一个可下载的安装包：mac 按芯片拆成 Apple 芯片与 Intel 两个 */
export type TargetKey = "mac-arm64" | "mac-x64" | "windows" | "android";

export interface TargetRelease {
  target: TargetKey;
  url: string;
  size: number;
  /** 该安装包自身的版本：移动端与桌面端版本号各自编排 */
  version: string;
}

export interface ReleaseInfo {
  version: string;
  releaseDate: string;
  targets: TargetRelease[];
}

interface DownloadTarget {
  target: TargetKey;
  os: PlatformKey;
  arch: ArchKey;
  label: string;
  /** 发布源内的清单路径，安装包与清单同目录 */
  feed: string;
  installer: RegExp;
}

// 顺序即构建时的按钮顺序；访客打开页面后再按其系统与芯片调整主按钮
export const DOWNLOAD_TARGETS: DownloadTarget[] = [
  {
    target: "mac-arm64",
    os: "mac",
    arch: "arm64",
    label: "macOS 版 · Apple 芯片",
    feed: "desktop/latest-mac.yml",
    installer: /-arm64\.dmg$/,
  },
  {
    target: "mac-x64",
    os: "mac",
    arch: "x64",
    label: "macOS 版 · Intel 芯片",
    feed: "desktop/latest-mac.yml",
    installer: /-x64\.dmg$/,
  },
  {
    target: "windows",
    os: "windows",
    arch: "x64",
    label: "Windows 版",
    feed: "desktop/latest.yml",
    installer: /\.exe$/,
  },
  {
    target: "android",
    os: "android",
    arch: "arm64",
    label: "Android 版",
    feed: "mobile/android/latest.json",
    installer: /-android-arm64\.apk$/,
  },
];

const OS_LABELS: Record<PlatformKey, string> = {
  mac: "macOS",
  windows: "Windows",
  android: "Android",
};

interface LatestYml {
  version?: string;
  releaseDate?: string;
  files?: { url: string; size?: number }[];
}

/**
 * 按安装包规则从一份清单里挑出各目标的文件。
 * mac 优先识别带架构的 dmg；0.57.2 旧包已核实为 arm64，允许过渡期继续下载。
 * 其余未标架构的安装包不推测芯片类型。
 */
function pickInstallers(doc: LatestYml, targets: DownloadTarget[]) {
  if (!doc?.version) throw new Error("发布清单缺少 version 字段");
  const files = doc.files ?? [];
  return {
    version: doc.version,
    releaseDate: doc.releaseDate ?? "",
    files: targets.flatMap(({ target, installer }) => {
      const file = files.find(f => installer.test(f.url)) ?? (
        target === "mac-arm64" && doc.version === "0.57.2"
          ? files.find(f => f.url === "Tau-v0.57.2-darwin.dmg")
          : undefined
      );
      return file ? [{ target, file: file.url, size: file.size ?? 0 }] : [];
    }),
  };
}

export function parseLatestYml(text: string, targets: DownloadTarget[]) {
  return pickInstallers(parse(text) as LatestYml, targets);
}

interface AndroidManifest {
  version?: string;
  releaseDate?: string;
  file?: string;
  size?: number;
}

/** Android 清单（scripts/publish-mobile.mjs 生成）只描述一个安装包 */
export function parseAndroidManifest(text: string, targets: DownloadTarget[]) {
  const { version, releaseDate, file, size } = JSON.parse(text) as AndroidManifest;
  return pickInstallers({ version, releaseDate, files: file ? [{ url: file, size }] : [] }, targets);
}

function parseFeed(feed: string, text: string, targets: DownloadTarget[]) {
  return feed.endsWith(".json") ? parseAndroidManifest(text, targets) : parseLatestYml(text, targets);
}

const feedDir = (feed: string) => feed.slice(0, feed.lastIndexOf("/"));

type Fetcher = (url: string) => Promise<{ ok: boolean; status: number; text(): Promise<string> }>;

/** 各发布源独立取数：某个平台未发布（404）时只是缺席，其余平台照常展示 */
export async function fetchReleaseInfo(fetcher: Fetcher = fetch): Promise<ReleaseInfo> {
  const feeds = [...new Set(DOWNLOAD_TARGETS.map(t => t.feed))];
  const results = await Promise.all(
    feeds.map(async feed => {
      const res = await fetcher(`${RELEASE_BASE_URL}/${feed}`);
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`读取 ${feed} 失败：HTTP ${res.status}`);
      const targets = DOWNLOAD_TARGETS.filter(t => t.feed === feed);
      return { feed, ...parseFeed(feed, await res.text(), targets) };
    })
  );
  const available = results.filter(
    (r): r is NonNullable<typeof r> => r !== null && r.files.length > 0
  );
  if (available.length === 0) throw new Error("发布源里没有任何平台的安装包");
  // 各平台可能不同步发版，页面展示桌面端最新的版本号；移动端版本号独立编排，只在没有桌面包时兜底
  const desktop = available.filter(r => r.feed.startsWith("desktop/"));
  const latest = (desktop.length > 0 ? desktop : available).reduce((a, b) =>
    compareVersion(b.version, a.version) > 0 ? b : a
  );
  const files = available.flatMap(r =>
    r.files.map(f => ({ ...f, dir: feedDir(r.feed), version: r.version }))
  );
  return {
    version: latest.version,
    releaseDate: latest.releaseDate,
    targets: DOWNLOAD_TARGETS.flatMap(({ target }) => {
      const hit = files.find(f => f.target === target);
      if (!hit) return [];
      const url = `${RELEASE_BASE_URL}/${hit.dir}/${hit.file}`;
      return [{ target, url, size: hit.size, version: hit.version }];
    }),
  };
}

function compareVersion(a: string, b: string) {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

/** 桌面安装包经统计服务计数后再跳转到发布源；统计服务只收录桌面产品，Android 直链发布源 */
function downloadUrl(release: TargetRelease) {
  if (release.target === "android") return release.url;
  const file = release.url.slice(`${RELEASE_BASE_URL}/desktop/`.length);
  return `${ANALYTICS_DOWNLOAD_BASE_URL}/${encodeURIComponent(file)}?channel=website`;
}

const DOWNLOAD_ICON = '<svg class="i"><use href="#i-down"/></svg>';

/**
 * 下载按钮：已发布的安装包排前面、第一个为主按钮；某个系统一个包都没有时
 * 显示一个「即将推出」占位（mac 两种芯片都没发布只占一个位置）
 */
export function renderDownloadButtons(info: ReleaseInfo | null) {
  const released = DOWNLOAD_TARGETS.flatMap(t => {
    const release = info?.targets.find(r => r.target === t.target);
    return release ? [{ ...t, url: downloadUrl(release) }] : [];
  });
  const pendingOs = [...new Set(DOWNLOAD_TARGETS.map(t => t.os))].filter(
    os => !released.some(r => r.os === os)
  );
  const pendingChips = DOWNLOAD_TARGETS.filter(
    t => !pendingOs.includes(t.os) && !released.some(r => r.target === t.target)
  );
  return [
    ...released.map(
      ({ target, os, arch, label, url }, i) =>
        `<a class="btn ${i === 0 ? "primary" : "ghost"}" data-target="${target}" data-os="${os}" data-arch="${arch}" href="${url}">${DOWNLOAD_ICON}下载 ${label}</a>`
    ),
    ...pendingChips.map(
      ({ target, os, arch, label }) =>
        `<span class="btn ghost is-disabled" data-target="${target}" data-os="${os}" data-arch="${arch}" aria-disabled="true">${label}即将推出</span>`
    ),
    ...pendingOs.map(
      os =>
        `<span class="btn ghost is-disabled" data-os="${os}" aria-disabled="true">${OS_LABELS[os]} 版即将推出</span>`
    ),
  ].join("\n");
}

/** 大小按系统合并展示：mac 两个包体积相近，取较大的一个 */
export function renderReleaseMeta(info: ReleaseInfo | null) {
  if (!info) return "版本信息暂不可用";
  const date = info.releaseDate ? `${info.releaseDate.slice(0, 10).replaceAll("-", ".")} 发布` : "";
  const sizes = (Object.keys(OS_LABELS) as PlatformKey[]).flatMap(os => {
    const bytes = Math.max(
      0,
      ...info.targets
        .filter(r => DOWNLOAD_TARGETS.find(t => t.target === r.target)?.os === os)
        .map(r => r.size)
    );
    if (bytes <= 0) return [];
    // 移动端版本号独立编排，单独标出，避免读成页面上的桌面版本
    const android = os === "android" && info.targets.find(r => r.target === "android");
    const label = android ? `${OS_LABELS[os]} v${android.version}` : OS_LABELS[os];
    return [`${label} 约 ${Math.round(bytes / 1024 / 1024)} MB`];
  });
  return [`v${info.version}`, date, ...sizes].filter(Boolean).join(" · ");
}
