import type { PortalApi } from "./types";

export async function savePluginZip(api: PortalApi, releaseId: string, filename: string) {
  const blob = await api.downloadRelease(releaseId);
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
