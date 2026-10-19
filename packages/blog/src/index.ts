export { ContentRenderer, type ContentRendererProps } from "./ContentRenderer";
export type { LinkRenderProps } from "./contentLink";
export type { OutlineHeading } from "./outline";
import { createClient as createDataClient } from "@tau/plugins/publish-client";
export function createClient({ manifestUrl }: Parameters<typeof createDataClient>[0]) {
  const base = typeof document === "undefined" ? undefined : document.baseURI;
  return createDataClient({ manifestUrl: new URL(manifestUrl, base).href });
}
export type * from "@tau/plugins/publish-data";
