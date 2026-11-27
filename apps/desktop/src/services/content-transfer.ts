import { desktopI18n } from "@/app/i18n/runtime";
import { contentTransferTranslator, contentTransferErrorText } from "./content-transfer.i18n";
/**
 * 内容导入导出的统一入口（卡片、文章、项目文档、独立编辑窗口共用）。
 * 导出：本机资源随文件打包——无本机资源存单个 .md，有则存 .zip（.md + assets/）。
 * 导入：选择 Markdown 文件，正文引用的本机资源经当前资源存储一并入库。
 */

import type { Descendant } from "slate";
import { toast } from "@tau/ui";
import { saveFileWithDialog, selectFile, showInFolder } from "@/commands";
import { sanitizeFileName } from "@/utils/file-name";
import {
  collectBundleAssets,
  toPortableMarkdown,
  zipBundle,
  type BundleFile,
} from "@/utils/content-transfer/bundle";
import { readMarkdownForImport, type ImportedMarkdown } from "@/utils/content-transfer/import";

const t = contentTransferTranslator.t;

export interface MarkdownOutputResult {
  canceled: boolean;
  filePath: string | null;
  format: "md" | "zip";
}

/** 保存 Markdown 输出：没有资源文件存 .md，有则与 assets/ 一起存 .zip */
export const saveMarkdownOutput = async (input: {
  baseName: string;
  markdown: string;
  assetFiles: BundleFile[];
}): Promise<MarkdownOutputResult> => {
  if (input.assetFiles.length === 0) {
    const result = await saveFileWithDialog({
      defaultFileName: `${input.baseName}.md`,
      filters: [{ name: "Markdown", extensions: ["md"] }],
      data: input.markdown,
    });
    return { ...result, format: "md" };
  }
  const bytes = await zipBundle([
    { path: `${input.baseName}.md`, data: input.markdown },
    ...input.assetFiles,
  ]);
  const result = await saveFileWithDialog({
    defaultFileName: `${input.baseName}.zip`,
    filters: [{ name: "ZIP", extensions: ["zip"] }],
    data: bytes,
  });
  return { ...result, format: "zip" };
};

const reportExportResult = async (
  result: Pick<MarkdownOutputResult, "canceled" | "filePath" | "format">,
  warnings: string[]
) => {
  if (result.canceled || !result.filePath) return;
  console.info("[transfer] 导出完成", { format: result.format, warnings: warnings.length });
  if (warnings.length > 0) {
    console.warn("导出警告:", warnings);
    toast.warning(
      t("export.assets", {
        count: warnings.length,
        amount: warnings.length.toLocaleString(desktopI18n.getSnapshot()),
      })
    );
  } else {
    toast.success(t("export.done"));
  }
  await showInFolder(result.filePath).catch(error => console.warn("打开导出目录失败:", error));
};

/** 持久正文按完整快照导出，不能把旧格式交给当前版本猜测。 */
export async function readContentForExport(content: Descendant[], contentId?: number) {
  if (!contentId) return { content, contracts: undefined };
  const document = await (await import("@/commands/content")).getContentById(contentId);
  if (!document)
    throw Object.assign(new Error("待导出正文已删除"), { code: "CONTENT_EXPORT_NOT_FOUND" });
  if (!document.contracts)
    throw Object.assign(new Error("CONTENT_FORMAT_UNSUPPORTED: 正文格式不受支持"), {
      code: "CONTENT_FORMAT_UNSUPPORTED",
    });
  return document;
}

/**
 * 单篇导出为 Markdown：本机图片 / 音视频 / 附件打包进 assets/ 并改为相对路径；
 * 应用内链接导出为标题文本。
 */
export const exportContentAsMarkdown = async (input: {
  title: string;
  content: Descendant[];
  contentId?: number;
  contracts?: import("@tau/db-schema/content-contracts").ContentContractDictionary;
}) => {
  try {
    const baseName = sanitizeFileName(input.title, "未命名");
    const document = input.contentId
      ? await (await import("@/commands/content")).getContentById(input.contentId)
      : null;
    if (input.contentId && !document)
      throw Object.assign(new Error("待导出正文已删除"), { code: "CONTENT_EXPORT_NOT_FOUND" });
    const content = document?.content ?? input.content,
      contracts = document?.contracts ?? input.contracts;
    const assets = await collectBundleAssets([content], { contracts });
    const processor = contracts
      ? await (await import("@/services/editorKit")).prepareContentMarkdown(contracts)
      : undefined;
    const markdown = toPortableMarkdown(content, {
      assets: assets.paths,
      dir: [],
      contracts,
      markdown: processor,
    });
    const result = await saveMarkdownOutput({ baseName, markdown, assetFiles: assets.files });
    await reportExportResult(result, assets.warnings);
  } catch (error) {
    // 序列化、资源收集、压缩都可能失败，界面上只有一条提示
    console.error("[transfer] 导出失败", { format: "markdown", contentId: input.contentId }, error);
    toast.error(t("export.failed", { reason: contentTransferErrorText(error) }));
  }
};

/**
 * 选择 Markdown 文件逐个导入：解析与资源入库在此完成，落库由调用方的 create 负责。
 * 单个文件失败不中断其余文件，结束后汇总提示。返回成功导入的数量。
 */
export const importMarkdownFiles = async (
  create: (doc: ImportedMarkdown) => Promise<unknown>,
  options: { target: "card" | "article" | "project-item" }
): Promise<number> => {
  const paths = await selectFile({
    properties: ["openFile", "multiSelections"],
    filters: [{ name: "Markdown", extensions: ["md", "markdown"] }],
  }).catch(error => {
    console.error(error);
    return null;
  });
  if (!paths?.length) return 0;

  let imported = 0;
  let failed = 0;
  const warnings: string[] = [];
  const startedAt = performance.now();
  for (const path of paths) {
    try {
      const doc = await readMarkdownForImport(path);
      await create(doc);
      imported += 1;
      warnings.push(...doc.warnings);
    } catch (error) {
      failed += 1;
      console.error(`导入失败（${path}）:`, error);
    }
  }

  if (imported === 0) {
    toast.error(t("import.failed"));
  } else {
    const status =
      failed > 0 && warnings.length > 0
        ? "partialBoth"
        : failed > 0
          ? "partialFailed"
          : warnings.length > 0
            ? "partialMissing"
            : "done";
    const locale = desktopI18n.getSnapshot();
    const summary = t(`import.${options.target}.${status}`, {
      count: imported,
      amount: imported.toLocaleString(locale),
      failed: failed.toLocaleString(locale),
      missing: warnings.length.toLocaleString(locale),
    });
    if (failed > 0 || warnings.length > 0) {
      if (warnings.length) console.warn("导入警告:", warnings);
      toast.warning(summary);
    } else toast.success(summary);
  }
  console.info("[transfer] Markdown 文件导入结束", {
    target: options.target,
    selected: paths.length,
    imported,
    failed,
    warnings: warnings.length,
    elapsedMs: Math.round(performance.now() - startedAt),
  });
  return imported;
};

interface WordExportInput {
  title: string;
  content: Descendant[];
  contentId?: number;
  assetDirectory?: string;
}

/** Word 生成器及其排版依赖在用户选择导出时加载；warnings 为未能嵌入的图片。 */
export async function saveContentAsWord(input: WordExportInput) {
  const [{ buildWordExport }, { default: useSettingStore }] = await Promise.all([
    import("@/utils/word-export"),
    import("@/stores/useSettingStore"),
  ]);
  const title = input.title.trim() || "未命名文档";
  const snapshot = await readContentForExport(input.content, input.contentId);
  const { bytes, warnings } = await buildWordExport(snapshot, {
    title,
    font: useSettingStore.getState().setting.fontSetting,
    assetDirectory: input.assetDirectory,
  });
  const result = await saveFileWithDialog({
    defaultFileName: sanitizeFileName(title, "未命名文档") + ".docx",
    filters: [{ name: t("filter.word"), extensions: ["docx"] }],
    data: bytes,
  });
  return { canceled: result.canceled, filePath: result.filePath ?? null, warnings };
}

export async function exportContentAsWord(input: WordExportInput) {
  try {
    const { canceled, filePath, warnings } = await saveContentAsWord(input);
    if (canceled || !filePath) return;
    console.info("[transfer] 导出完成", { format: "word", warnings: warnings.length });
    if (warnings.length)
      toast.warning(
        t("word.assets", {
          count: warnings.length,
          amount: warnings.length.toLocaleString(desktopI18n.getSnapshot()),
        })
      );
    else toast.success(t("word.done"));
    await showInFolder(filePath).catch(error => console.warn("打开导出目录失败:", error));
  } catch (error) {
    // 文档构建与图片编码在渲染进程里失败时，界面上只有一条提示
    console.error("[transfer] 导出失败", { format: "word", contentId: input.contentId }, error);
    toast.error(t("word.failed", { reason: contentTransferErrorText(error) }));
  }
}
