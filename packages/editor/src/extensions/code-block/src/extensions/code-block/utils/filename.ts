/** 文件名写进围栏 `title="…"`，去掉引号与换行；空串视为未设置 */
export const normalizeCodeBlockFilename = (value: unknown): string | undefined => {
  if (typeof value !== "string") return undefined;
  const normalized = value.replace(/["\r\n]/g, "").trim();
  return normalized || undefined;
};
