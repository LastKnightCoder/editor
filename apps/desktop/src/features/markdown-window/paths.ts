/**
 * 渲染端的路径小工具（同步、纯函数）。分隔符按路径自身推断：含 \ 且不含 / 视为 Windows 风格，
 * 其余用 /——主进程 readDirectory 返回的就是本机风格，拼接时沿用即可，无需异步取 sep。
 */

const sepOf = (path: string) => (path.includes("\\") && !path.includes("/") ? "\\" : "/");

const trimTrailingSep = (path: string) => path.replace(/[\\/]+$/, "") || path;

export function joinPath(dir: string, name: string): string {
  return `${trimTrailingSep(dir)}${sepOf(dir)}${name}`;
}

export function baseName(path: string): string {
  const parts = trimTrailingSep(path).split(/[\\/]/);
  return parts[parts.length - 1] || path;
}

export function dirName(path: string): string {
  const trimmed = trimTrailingSep(path);
  const index = Math.max(trimmed.lastIndexOf("/"), trimmed.lastIndexOf("\\"));
  return index > 0 ? trimmed.slice(0, index) : trimmed.slice(0, index + 1);
}

/** 文件名拆成主名与扩展名（.gitignore 这类点开头的视为无扩展名） */
export function splitExtension(name: string): { stem: string; ext: string } {
  const index = name.lastIndexOf(".");
  return index <= 0
    ? { stem: name, ext: "" }
    : { stem: name.slice(0, index), ext: name.slice(index) };
}

const normalize = (path: string) => trimTrailingSep(path.replace(/\\/g, "/"));

/** path 是否等于 dir 或位于其下 */
export function isWithin(path: string, dir: string): boolean {
  const target = normalize(path);
  const base = normalize(dir);
  return target === base || target.startsWith(`${base}/`);
}

/** 把位于 from 下的 path 改到 to 下（重命名 / 移动文件夹时跟随其中的文件）；不在其下原样返回 */
export function rebasePath(path: string, from: string, to: string): string {
  if (!isWithin(path, from)) return path;
  return to + path.slice(trimTrailingSep(from).length);
}

/** 文件名合法性：不能为空、不能含路径分隔与 Windows 保留字符、不能是 . / .. */
export function invalidFileName(name: string): string | null {
  if (!name.trim()) return "名称不能为空";
  if (/[\\/:*?"<>|]/.test(name)) return '名称不能包含 \\ / : * ? " < > |';
  if (name === "." || name === "..") return "名称无效";
  return null;
}
