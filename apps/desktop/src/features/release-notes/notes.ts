/**
 * 升级公告数据：安装包内置的公告（升级后展示）与按版本区间截取。
 * 公告源文件在 apps/desktop/release-notes/<版本>.md，编写规范见同目录 README.md。
 */

import type { ReleaseNote } from "@/commands/updater";

const NOTE_PATH_RE = /\/(\d+\.\d+\.\d+)\.md$/;

const BUNDLED_NOTES: ReleaseNote[] = Object.entries(
  import.meta.glob<string>("../../../release-notes/*.md", {
    query: "?raw",
    import: "default",
    eager: true,
  })
).flatMap(([path, note]) => {
  const version = NOTE_PATH_RE.exec(path)?.[1];
  return version && note.trim() ? [{ version, note: note.trim() }] : [];
});

export function compareVersions(a: string, b: string): number {
  const left = a.split(".").map(Number);
  const right = b.split(".").map(Number);
  for (let index = 0; index < 3; index++) {
    if (left[index] !== right[index]) return (left[index] ?? 0) - (right[index] ?? 0);
  }
  return 0;
}

/** 截取 (from, to] 区间的公告并从新到旧排列；from 为空时只取 to 这一版 */
export function notesBetween(notes: ReleaseNote[], from: string | null, to: string): ReleaseNote[] {
  return notes
    .filter(item =>
      from
        ? compareVersions(item.version, from) > 0 && compareVersions(item.version, to) <= 0
        : item.version === to
    )
    .sort((a, b) => compareVersions(b.version, a.version));
}

export function bundledNotesBetween(from: string | null, to: string): ReleaseNote[] {
  return notesBetween(BUNDLED_NOTES, from, to);
}
