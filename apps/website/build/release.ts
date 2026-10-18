/**
 * 下载信息：构建时读取 dl.taunote.app 上 electron-updater 的 latest*.yml，
 * 把版本号、发布日期、安装包地址与大小写进页面，页面本身不在运行时请求发布源。
 */
import { parse } from "yaml";

export const RELEASE_BASE_URL = "https://dl.taunote.app/desktop";
export const ANALYTICS_DOWNLOAD_BASE_URL = "https://analytics.taunote.app/v1/downloads";

export type PlatformKey = "mac" | "windows";

export interface PlatformRelease {
  os: PlatformKey;
  url: string;
  size: number;
}

export interface ReleaseInfo {
  version: string;
  releaseDate: string;
  platforms: PlatformRelease[];
}

interface PlatformFeed {
  os: PlatformKey;
  label: string;
  feed: string;
  installer: RegExp;
}

export const PLATFORM_FEEDS: PlatformFeed[] = [
  { os: "mac", label: "macOS", feed: "latest-mac.yml", installer: /\.dmg$/ },
  { os: "windows", label: "Windows", feed: "latest.yml", installer: /\.exe$/ },
];

interface LatestYml {
  version?: string;
  releaseDate?: string;
  path?: string;
  files?: { url: string; size?: number }[];
}

/** 解析单个 latest*.yml：优先取安装包（dmg / exe），没有时退回 path 指向的文件 */
export function parseLatestYml(text: string, installer: RegExp) {
  const doc = parse(text) as LatestYml;
  if (!doc?.version) throw new Error("latest yml 缺少 version 字段");
  const file =
    doc.files?.find(f => installer.test(f.url)) ?? doc.files?.find(f => f.url === doc.path);
  if (!file) throw new Error(`latest yml 中找不到安装包（${installer}）`);
  return {
    version: doc.version,
    releaseDate: doc.releaseDate ?? "",
    file: file.url,
    size: file.size ?? 0,
  };
}

type Fetcher = (url: string) => Promise<{ ok: boolean; status: number; text(): Promise<string> }>;

/** 各平台独立取数：某个平台未发布（404）时只是缺席，其余平台照常展示 */
export async function fetchReleaseInfo(fetcher: Fetcher = fetch): Promise<ReleaseInfo> {
  const results = await Promise.all(
    PLATFORM_FEEDS.map(async ({ os, feed, installer }) => {
      const res = await fetcher(`${RELEASE_BASE_URL}/${feed}`);
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`读取 ${feed} 失败：HTTP ${res.status}`);
      return { os, ...parseLatestYml(await res.text(), installer) };
    })
  );
  const available = results.filter(r => r !== null);
  if (available.length === 0) throw new Error("发布源里没有任何平台的安装包");
  // 各平台可能不同步发版，页面展示最新的那个版本号
  const latest = available.reduce((a, b) => (compareVersion(b.version, a.version) > 0 ? b : a));
  return {
    version: latest.version,
    releaseDate: latest.releaseDate,
    platforms: available.map(r => ({
      os: r.os,
      url: `${RELEASE_BASE_URL}/${r.file}`,
      size: r.size,
    })),
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

const DOWNLOAD_ICON = '<svg class="i"><use href="#i-down"/></svg>';

/** 下载按钮：已发布的平台排前面、第一个为主按钮；未发布的平台排在后面显示「即将推出」 */
export function renderDownloadButtons(info: ReleaseInfo | null) {
  const released = PLATFORM_FEEDS.flatMap(feed => {
    const release = info?.platforms.find(p => p.os === feed.os);
    return release
      ? [
          {
            ...feed,
            url: `${ANALYTICS_DOWNLOAD_BASE_URL}/${encodeURIComponent(release.url.slice(RELEASE_BASE_URL.length + 1))}?channel=website`,
          },
        ]
      : [];
  });
  const pending = PLATFORM_FEEDS.filter(feed => !released.some(r => r.os === feed.os));
  return [
    ...released.map(
      ({ os, label, url }, i) =>
        `<a class="btn ${i === 0 ? "primary" : "ghost"}" data-os="${os}" href="${url}">${DOWNLOAD_ICON}下载 ${label} 版</a>`
    ),
    ...pending.map(
      ({ os, label }) =>
        `<span class="btn ghost is-disabled" data-os="${os}" aria-disabled="true">${label} 版即将推出</span>`
    ),
  ].join("\n");
}

export function renderReleaseMeta(info: ReleaseInfo | null) {
  if (!info) return "版本信息暂不可用";
  const date = info.releaseDate ? `${info.releaseDate.slice(0, 10).replaceAll("-", ".")} 发布` : "";
  const sizes = info.platforms
    .filter(p => p.size > 0)
    .map(
      p =>
        `${PLATFORM_FEEDS.find(f => f.os === p.os)!.label} 约 ${Math.round(p.size / 1024 / 1024)} MB`
    );
  return [`v${info.version}`, date, ...sizes].filter(Boolean).join(" · ");
}
