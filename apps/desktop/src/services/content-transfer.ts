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

export const reportExportResult = async (
  result: Pick<MarkdownOutputResult, "canceled" | "filePath">,
  warnings: string[]
) => {
  if (result.canceled || !result.filePath) return;
  if (warnings.length > 0) {
    console.warn("导出警告:", warnings);
    toast.warning(`已导出，${warnings.length} 个资源未能打包，保留了原地址`);
  } else {
    toast.success("已导出");
  }
  await showInFolder(result.filePath).catch(error => console.warn("打开导出目录失败:", error));
};

/**
 * 单篇导出为 Markdown：本机图片 / 音视频 / 附件打包进 assets/ 并改为相对路径；
 * 应用内链接导出为标题文本。
 */
export const exportContentAsMarkdown = async (input: { title: string; content: Descendant[] }) => {
  try {
    const baseName = sanitizeFileName(input.title, "未命名");
    const assets = await collectBundleAssets([input.content]);
    const markdown = toPortableMarkdown(input.content, { assets: assets.paths, dir: [] });
    const result = await saveMarkdownOutput({ baseName, markdown, assetFiles: assets.files });
    await reportExportResult(result, assets.warnings);
  } catch (error) {
    toast.error(`导出失败：${error instanceof Error ? error.message : String(error)}`);
  }
};

/**
 * 选择 Markdown 文件逐个导入：解析与资源入库在此完成，落库由调用方的 create 负责。
 * 单个文件失败不中断其余文件，结束后汇总提示。返回成功导入的数量。
 */
export const importMarkdownFiles = async (
  create: (doc: ImportedMarkdown) => Promise<unknown>,
  options: { unit: string } = { unit: "篇" }
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

  const summary = `已导入 ${imported} ${options.unit}`;
  if (imported === 0) {
    toast.error("导入失败");
  } else if (failed > 0 || warnings.length > 0) {
    if (warnings.length > 0) console.warn("导入警告:", warnings);
    const parts = [
      failed > 0 ? `${failed} 个文件失败` : "",
      warnings.length > 0 ? `${warnings.length} 个资源未找到` : "",
    ].filter(Boolean);
    toast.warning(`${summary}，${parts.join("、")}`);
  } else {
    toast.success(summary);
  }
  return imported;
};
