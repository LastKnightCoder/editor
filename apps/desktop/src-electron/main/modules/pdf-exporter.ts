import { BrowserWindow, dialog } from "electron";
import { writeFile } from "node:fs/promises";
import type { PdfExportPayload, PdfExportResult } from "@/types/pdf-export";

/**
 * PDF 打印专用样式
 * 控制分页、避免元素截断、优化排版
 */
const PDF_PRINT_CSS = `
@media print {
  /* 标题避免孤行 */
  h1, h2, h3, h4, h5, h6 {
    page-break-after: avoid;
    page-break-inside: avoid;
    break-after: avoid;
    break-inside: avoid;
  }

  /* H1 章节换页（可选） */
  .chapter-break h1 {
    page-break-before: always;
    break-before: always;
  }

  /* 段落孤行/寡行控制 */
  p {
    orphans: 3;
    widows: 3;
  }

  /* 代码块避免截断 */
  pre, .code-block {
    page-break-inside: avoid;
    break-inside: avoid;
    overflow: visible;
    white-space: pre-wrap;
  }

  /* 明确禁止分页的代码块 - 使用更强的约束 */
  pre.no-break, .code-block.no-break {
    page-break-inside: avoid !important;
    break-inside: avoid !important;
    display: inline-block;
    width: 100%;
    vertical-align: top;
  }

  /* 长代码块允许跨页 */
  pre.allow-break {
    page-break-inside: auto;
    break-inside: auto;
  }

  /* 表格避免截断 */
  table {
    page-break-inside: avoid;
    break-inside: avoid;
  }

  /* 表头跨页重复 */
  thead {
    display: table-header-group;
  }

  /* 表格行避免截断 */
  tr {
    page-break-inside: avoid;
    break-inside: avoid;
  }

  /* 图片避免截断 */
  img, svg, figure {
    page-break-inside: avoid;
    break-inside: avoid;
    max-width: 100%;
    height: auto;
  }

  /* Callout 避免截断 */
  .callout {
    page-break-inside: avoid;
    break-inside: avoid;
  }

  /* 数学公式避免截断 */
  .block-math, .math-display {
    page-break-inside: avoid;
    break-inside: avoid;
  }

  /* 图表避免截断 */
  .diagram-svg, .mermaid, .echarts-container {
    page-break-inside: avoid;
    break-inside: avoid;
  }

  /* 隐藏不需要打印的元素 */
  .no-print {
    display: none !important;
  }
}
`.trim();

/**
 * 构建完整的 PDF HTML 文档
 */
const buildPdfHtml = (payload: PdfExportPayload): string => {
  const { html, styles, metadata, options } = payload;

  // 添加章节换页类
  const bodyClass = options.chapterBreak ? "chapter-break" : "";

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(metadata.title)}</title>
  ${metadata.author ? `<meta name="author" content="${escapeHtml(metadata.author)}">` : ""}
  ${metadata.subject ? `<meta name="subject" content="${escapeHtml(metadata.subject)}">` : ""}
  ${metadata.keywords ? `<meta name="keywords" content="${escapeHtml(metadata.keywords)}">` : ""}

  <!-- 基础样式 -->
  <style>${styles}</style>

  <!-- PDF 打印样式 -->
  <style>${PDF_PRINT_CSS}</style>
</head>
<body class="${bodyClass}">
  ${html}
</body>
</html>`;
};

/**
 * HTML 转义
 */
const escapeHtml = (text: string): string => {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
};

/**
 * 确保文件名有 .pdf 扩展名
 */
const ensurePdfExtension = (fileName: string): string => {
  if (/\.pdf$/i.test(fileName)) {
    return fileName;
  }
  return `${fileName}.pdf`;
};

const mmToInch = (mm: number) => mm / 25.4;

const resolvePdfMargins = (margins?: {
  top?: number;
  bottom?: number;
  left?: number;
  right?: number;
}) => {
  return {
    top: mmToInch(margins?.top ?? 20),
    bottom: mmToInch(margins?.bottom ?? 20),
    left: mmToInch(margins?.left ?? 15),
    right: mmToInch(margins?.right ?? 15),
  };
};

const getPaperSizeInInch = (
  pageSize: PdfExportPayload["options"]["pageSize"] = "A4",
  landscape = false,
) => {
  const paperSizeMap: Record<
    PdfExportPayload["options"]["pageSize"],
    { width: number; height: number }
  > = {
    A3: { width: 11.69, height: 16.54 },
    A4: { width: 8.27, height: 11.69 },
    A5: { width: 5.83, height: 8.27 },
    Letter: { width: 8.5, height: 11 },
    Legal: { width: 8.5, height: 14 },
    Tabloid: { width: 11, height: 17 },
  };
  const base = paperSizeMap[pageSize] || paperSizeMap.A4;
  if (!landscape) {
    return base;
  }
  return {
    width: base.height,
    height: base.width,
  };
};

const applyAdaptiveCodeBlockBreaks = async (
  win: BrowserWindow,
  payload: PdfExportPayload,
) => {
  const marginsInInch = resolvePdfMargins(payload.options.margins);
  const paper = getPaperSizeInInch(
    payload.options.pageSize || "A4",
    payload.options.landscape || false,
  );
  const printableHeightPx = Math.max(
    1,
    (paper.height - marginsInInch.top - marginsInInch.bottom) * 96,
  );

  await win.webContents.executeJavaScript(`
    (() => {
      const printableHeightPx = ${JSON.stringify(printableHeightPx)};

      const countLines = (block) => {
        const lineNodes = block.querySelectorAll(".line");
        if (lineNodes.length > 0) {
          return lineNodes.length;
        }
        const text = (block.textContent || "").replace(/\\n$/, "");
        if (!text) return 1;
        return text.split(/\\r?\\n/).length;
      };

      const isElementVisible = (el) => {
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      };

      const applyPass = () => {
        const blocks = Array.from(document.querySelectorAll("pre, .code-block"))
          .filter((el) => el instanceof HTMLElement && isElementVisible(el));

        for (const block of blocks) {
          block.classList.remove("allow-break", "no-break");

          const rect = block.getBoundingClientRect();
          const blockTop = rect.top + window.scrollY;
          const blockHeight = rect.height;
          const offsetInPage = blockTop % printableHeightPx;
          const remainingInPage = printableHeightPx - offsetInPage;

          const lineHeightValue = parseFloat(window.getComputedStyle(block).lineHeight);
          const lineHeight = Number.isFinite(lineHeightValue) && lineHeightValue > 0
            ? lineHeightValue
            : 22;
          const totalLines = countLines(block);
          const linesFitCurrentPage = Math.floor(remainingInPage / lineHeight);

          if (blockHeight <= remainingInPage) {
            block.classList.add("no-break");
            continue;
          }

          if (blockHeight > printableHeightPx) {
            block.classList.add("allow-break");
            continue;
          }

          const longEnoughToSplit = totalLines >= 12;
          const hasEnoughRoomToAvoidUglySplit = linesFitCurrentPage >= 4;
          if (longEnoughToSplit && hasEnoughRoomToAvoidUglySplit) {
            block.classList.add("allow-break");
          } else {
            block.classList.add("no-break");
          }
        }
      };

      // 连续两次计算，减少样式变更后的布局抖动
      applyPass();
      applyPass();
    })();
  `);
};

/**
 * 等待页面渲染完成
 * 包括字体加载、MathJax 渲染等
 */
const waitForPageReady = async (win: BrowserWindow): Promise<void> => {
  await win.webContents.executeJavaScript(`
    new Promise((resolve) => {
      let settled = false;
      const finish = () => {
        if (!settled) {
          settled = true;
          resolve(true);
        }
      };

      const timeoutId = setTimeout(finish, 8000);
      const waitDom = document.readyState === "complete"
        ? Promise.resolve()
        : new Promise((domResolve) => {
            window.addEventListener("load", () => domResolve(), { once: true });
          });
      const waitFonts = document.fonts?.ready
        ? Promise.resolve(document.fonts.ready).catch(() => undefined)
        : Promise.resolve();

      Promise.all([waitDom, waitFonts])
        .then(() => {
          if (window.MathJax?.typesetPromise) {
            return window.MathJax.typesetPromise().catch(() => undefined);
          }
          return undefined;
        })
        .finally(() => {
          clearTimeout(timeoutId);
          setTimeout(finish, 200);
        });
    })
  `);
};

/**
 * 导出 PDF（带保存对话框）
 */
export const exportPdfWithDialog = async (
  payload: PdfExportPayload,
): Promise<PdfExportResult> => {
  const warnings: string[] = [];

  // 1. 显示保存对话框
  const defaultFileName = ensurePdfExtension(
    payload.defaultFileName || payload.metadata.title || "未命名文档",
  );

  const result = await dialog.showSaveDialog({
    title: "导出 PDF",
    defaultPath: defaultFileName,
    filters: [{ name: "PDF 文件", extensions: ["pdf"] }],
  });

  if (result.canceled || !result.filePath) {
    return {
      canceled: true,
      filePath: null,
      warnings: [],
    };
  }

  // 2. 构建 HTML
  const html = buildPdfHtml(payload);

  // 3. 创建隐藏窗口
  const win = new BrowserWindow({
    show: false,
    width: 794, // A4 宽度（像素，96 DPI）
    height: 1123, // A4 高度（像素，96 DPI）
    webPreferences: {
      offscreen: true,
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  try {
    // 4. 加载 HTML
    const dataUrl = `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
    await win.loadURL(dataUrl);

    // 5. 等待渲染完成
    await waitForPageReady(win);

    if (payload.options.codeBlockBreak?.strategy === "adaptive") {
      await applyAdaptiveCodeBlockBreaks(win, payload);
    }

    // 6. 生成 PDF
    const generateOutline = payload.options.generateOutline ?? false;
    const pdfData = await win.webContents.printToPDF({
      pageSize: payload.options.pageSize || "A4",
      landscape: payload.options.landscape || false,
      printBackground: payload.options.printBackground ?? true,
      margins: resolvePdfMargins(payload.options.margins),
      preferCSSPageSize: false,
      displayHeaderFooter: payload.options.displayHeaderFooter ?? false,
      headerTemplate: payload.options.headerTemplate || "<div></div>",
      footerTemplate: payload.options.footerTemplate || "<div></div>",
      // 书签大纲依赖 tagged PDF 管线生成，两者一起开启
      generateTaggedPDF: generateOutline,
      generateDocumentOutline: generateOutline,
    });

    // 7. 保存文件
    await writeFile(result.filePath, pdfData);

    return {
      canceled: false,
      filePath: result.filePath,
      warnings,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    warnings.push(`PDF 生成失败: ${errorMessage}`);

    return {
      canceled: false,
      filePath: null,
      warnings,
    };
  } finally {
    // 8. 清理窗口
    win.close();
  }
};
