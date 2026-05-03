import type { IPublishFaviconConfig } from "@/types/publish";

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

export function buildPublishFaviconHref(
  basePath: string,
  format: IPublishFaviconConfig["format"],
): string {
  const normalizedBasePath =
    !basePath || basePath === "/"
      ? "/"
      : `${basePath.replace(/\/+$/, "").replace(/^([^/])/, "/$1")}/`;
  return `${normalizedBasePath}favicon.${format}`;
}

export function resolvePublishFaviconOutput(
  favicon: IPublishFaviconConfig,
  basePath = "/",
): IResolvedPublishFaviconOutput {
  return {
    outputPath: `favicon.${favicon.format}`,
    mimeType: FAVICON_MIME_TYPE_MAP[favicon.format],
    href: buildPublishFaviconHref(basePath, favicon.format),
  };
}
