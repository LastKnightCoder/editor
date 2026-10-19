import type { IPublishFaviconConfig } from "@/types/publish";
import { createHash } from "node:crypto";

export interface IResolvedPublishFaviconOutput {
  outputPath: string;
  mimeType: string;
  href: string;
}

const FAVICON_MIME_TYPE_MAP: Record<IPublishFaviconConfig["format"], string> = {
  svg: "image/svg+xml",
  png: "image/png",
  ico: "image/x-icon",
};

export function resolvePublishFaviconOutput(
  favicon: IPublishFaviconConfig,
  content: Buffer,
  basePath = "/"
): IResolvedPublishFaviconOutput {
  const hash = createHash("sha256").update(content).digest("hex");
  const outputPath = `_tau/site/${hash}.${favicon.format}`;
  return {
    outputPath,
    mimeType: FAVICON_MIME_TYPE_MAP[favicon.format],
    href: `${basePath}${outputPath}`,
  };
}
