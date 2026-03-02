import type { Descendant } from "slate";
import { exportEpubWithDialog } from "@/commands";
import type {
  EpubExportPayload,
  EpubExportResult,
  EpubMetadataInput,
} from "@/types";
import { htmlSerializerRegistry } from "@/utils/html-serializers";
import { processEpubAssets } from "./assets";
import { buildEpubChapters, isMeaningfulHtmlFragment } from "./chaptering";

export interface ExportSlateToEpubInput {
  content: Descendant[];
  metadata: EpubMetadataInput;
  defaultFileName?: string;
}

const sanitizeFileName = (value: string) => {
  const trimmed = (value || "").trim();
  if (!trimmed) {
    return "未命名文档";
  }
  const sanitized = trimmed
    // eslint-disable-next-line no-control-regex
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "_")
    .replace(/\s+/g, " ")
    .trim();
  return sanitized || "未命名文档";
};

export const buildEpubExportPayloadFromSlate = async (
  input: ExportSlateToEpubInput,
): Promise<{ payload: EpubExportPayload; warnings: string[] }> => {
  const serializedHtml = await htmlSerializerRegistry.serializeAsync(
    input.content || [],
    {
      codeTheme: "github-light",
    },
  );

  const chapterResult = buildEpubChapters(serializedHtml, {
    fallbackTitle: input.metadata.title,
  });
  const assetResult = await processEpubAssets({
    chapters: chapterResult.chapters,
    coverImageSrc: input.metadata.coverImageSrc,
  });

  const payload: EpubExportPayload = {
    metadata: {
      ...input.metadata,
      coverImageSrc: assetResult.coverImageSrc,
    },
    chapters: assetResult.chapters.filter((chapter) =>
      isMeaningfulHtmlFragment(chapter.xhtml),
    ),
    assets: assetResult.assets,
    defaultFileName: sanitizeFileName(
      input.defaultFileName || input.metadata.title || "未命名文档",
    ),
  };

  if (payload.chapters.length === 0) {
    payload.chapters = [
      {
        id: "chapter-1",
        title: input.metadata.title || "未命名文档",
        xhtml: "<p></p>",
      },
    ];
  }

  return {
    payload,
    warnings: assetResult.warnings,
  };
};

export const exportSlateToEpubWithDialog = async (
  input: ExportSlateToEpubInput,
): Promise<EpubExportResult> => {
  const { payload, warnings } = await buildEpubExportPayloadFromSlate(input);
  const result = await exportEpubWithDialog(payload);

  return {
    ...result,
    warnings: [...warnings, ...(result.warnings || [])],
  };
};

export * from "./metadata";
