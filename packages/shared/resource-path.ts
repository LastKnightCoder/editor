/** 本地资源引用使用正斜杠，避免 Windows 的反斜杠被 Markdown 当作转义。 */
export function normalizeLocalResourcePath(value: string): string {
  if (/^[a-z][a-z\d+.-]*:/i.test(value) && !/^[a-z]:[\\/]/i.test(value)) return value;
  // 旧图片引用中的 `~\.editor` 经过 Markdown 后可能丢失 `\.` 的反斜杠。
  return value.replace(/^~\.editor(?=[\\/])/, "~/.editor").replace(/\\/g, "/");
}
