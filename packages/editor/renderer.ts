import "./src/builtin-types";

export { ContentRenderer, type ContentRendererProps } from "./src/renderer/ContentRenderer";
import { createClient as createDataClient } from "@tau/plugins/publish-client";
export function createClient({ manifestUrl }: Parameters<typeof createDataClient>[0]) {
  const base = typeof document === "undefined" ? undefined : document.baseURI;
  return createDataClient({ manifestUrl: new URL(manifestUrl, base).href });
}
export type { DataManifest, DataResult, ContentRef } from "@tau/plugins/publish-data";
