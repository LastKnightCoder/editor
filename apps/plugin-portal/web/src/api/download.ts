import type { PortalApi } from "./types";
import { saveBlob } from "../components/saveBlob";

export async function savePluginZip(api: PortalApi, releaseId: string, filename: string) {
  const blob = await api.downloadRelease(releaseId);
  saveBlob(blob, filename);
}
