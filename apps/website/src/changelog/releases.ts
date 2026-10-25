/**
 * 更新日志的数据：桌面端与手机端的发布说明（apps/<端>/release-notes/<版本号>.md），按版本从新到旧排列。
 * 纯函数，不依赖 Vite，便于单测。
 */
export type ReleasePlatform = "desktop" | "mobile";

export interface ReleaseNote {
  version: string;
  /** 正文 Markdown，标题已整体降一级（版本号是页面上的二级标题） */
  markdown: string;
}

export const PLATFORMS: readonly { key: ReleasePlatform; label: string; summary: string }[] = [
  { key: "desktop", label: "桌面端", summary: "macOS 与 Windows" },
  { key: "mobile", label: "手机端", summary: "Android" },
];

const VERSION_FILE = /(?:^|\/)(\d+\.\d+\.\d+)\.md$/;

function compareVersionsDesc(a: string, b: string) {
  const left = a.split(".").map(Number);
  const right = b.split(".").map(Number);
  for (let index = 0; index < 3; index++) {
    const diff = (right[index] ?? 0) - (left[index] ?? 0);
    if (diff) return diff;
  }
  return 0;
}

/** 正文从二级标题写起；页面已用二级标题放版本号，正文标题统一降一级，代码块内不动 */
export function demoteHeadings(markdown: string): string {
  let inFence = false;
  return markdown
    .split("\n")
    .map(line => {
      if (/^\s*(```|~~~)/.test(line)) inFence = !inFence;
      return !inFence && /^#{1,5} /.test(line) ? `#${line}` : line;
    })
    .join("\n");
}

/** 文件路径 → 原文；非版本号命名的文件（如 README.md）与空文件跳过 */
export function collectReleaseNotes(files: Record<string, string>): ReleaseNote[] {
  return Object.entries(files)
    .flatMap(([path, source]) => {
      const version = VERSION_FILE.exec(path)?.[1];
      const markdown = source.trim();
      return version && markdown ? [{ version, markdown: demoteHeadings(markdown) }] : [];
    })
    .sort((a, b) => compareVersionsDesc(a.version, b.version));
}

/** 版本锚点：#desktop-0.60.0 / #mobile-0.2.7，同时决定打开哪一端 */
export const releaseAnchor = (platform: ReleasePlatform, version: string) =>
  `${platform}-${version}`;

export function parseReleaseHash(hash: string): { platform: ReleasePlatform; version?: string } {
  const match = /^#?(desktop|mobile)(?:-(\d+\.\d+\.\d+))?$/.exec(decodeURIComponent(hash));
  if (!match) return { platform: "desktop" };
  return { platform: match[1] as ReleasePlatform, version: match[2] };
}
