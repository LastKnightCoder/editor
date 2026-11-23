import type { Descendant } from "slate";
import type { ContentContractDictionary } from "@tau/db-schema/content-contracts";
import type { WindowFont } from "../../../shared/window-font";
import { collectAssetUrls } from "@/utils/content-transfer/assets";
import { htmlSerializerRegistry } from "@/utils/html-serializers";
import { buildWordDocument } from "./document";
import { embedImage } from "./images";

export async function buildWordExport(
  source: { content: Descendant[]; contracts?: ContentContractDictionary },
  options: { title: string; font: WindowFont; assetDirectory?: string }
) {
  const html = await htmlSerializerRegistry.serializeAsync(source.content, {
    codeTheme: "github-light",
    requireStaticContent: true,
  });
  const urls = new Set(
    collectAssetUrls(source.content, undefined, source.contracts)
      .filter(asset => asset.kind === "image")
      .map(asset => asset.url)
  );
  return buildWordDocument(html, options.title, options.font, (el, maxWidth) =>
    embedImage(el, maxWidth, urls, options.assetDirectory)
  );
}
