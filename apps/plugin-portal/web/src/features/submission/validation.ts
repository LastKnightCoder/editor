import { LIMITS } from "../../../../contracts";
export function formatBytes(bytes: number) {
  return bytes < 1024
    ? `${bytes} B`
    : bytes < 1024 * 1024
      ? `${(bytes / 1024).toFixed(1)} KiB`
      : `${(bytes / 1024 / 1024).toFixed(1)} MiB`;
}
export function precheckFile(file: File): string | null {
  if (!file.name.toLowerCase().endsWith(".zip")) return "请选择插件ZIP";
  if (!file.size || file.size > LIMITS.zipBytes) return "插件ZIP须为8MiB以内的非空文件";
  return null;
}
