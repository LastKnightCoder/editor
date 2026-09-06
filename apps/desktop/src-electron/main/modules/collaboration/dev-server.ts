import { app } from "electron";
import { normalizeServerUrl } from "@tau/collaboration";

export function getDevelopmentServerUrl(): string | undefined {
  const url = process.env.TAU_COLLAB_DEV_SERVER_URL;
  return !app.isPackaged && url ? normalizeServerUrl(url) : undefined;
}
