import {
  Uint8ArrayReader,
  Uint8ArrayWriter,
  ZipWriter,
  configure,
} from "@zip.js/zip.js";
import { dialog } from "electron";
import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import type {
  EpubAsset,
  EpubChapter,
  EpubExportPayload,
  EpubExportResult,
  EpubMetadataInput,
} from "@/types/epub-export";

configure({
  useWebWorkers: false,
});

const EPUB_MIME_TYPE = "application/epub+zip";
const OEBPS_PREFIX = "OEBPS";

const BOOK_CSS = `
html, body {
  margin: 0;
  padding: 0;
}
body {
  font-family: -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif;
  line-height: 1.75;
  color: #111;
  padding: 1.2em;
}
h1, h2, h3, h4, h5, h6 {
  line-height: 1.35;
  margin: 1.4em 0 0.7em;
}
p, ul, ol, blockquote, pre, table {
  margin: 0.9em 0;
}
img {
  max-width: 100%;
  height: auto;
}
a {
  color: #0f766e;
  text-decoration-line: underline;
  text-decoration-color: rgba(15, 118, 110, 0.4);
  text-underline-offset: 0.16em;
}
pre, code {
  font-family: "SFMono-Regular", Menlo, Consolas, monospace;
}
pre {
  white-space: pre-wrap;
  overflow: visible;
  overflow-wrap: anywhere;
  word-break: break-word;
  page-break-inside: auto;
  break-inside: auto;
  padding: 0.8em;
  border-radius: 0.5em;
  background: transparent;
}
pre code {
  white-space: inherit;
  word-break: inherit;
}
.code-block,
pre.code-block,
pre.shiki {
  background: transparent !important;
  border: none;
  overflow: visible !important;
}
.code-block.shiki .line {
  display: block;
  min-height: 1em;
  white-space: inherit;
}
.inline-code {
  color: #18045f;
  background: transparent;
  padding: 0.25em;
  font-size: 0.9em;
  font-family: "SFMono-Regular", Menlo, Consolas, monospace;
}
.block-math {
  text-align: center;
  margin: 1em 0;
}
.block-math mjx-container {
  display: block !important;
  text-align: center !important;
}
.block-math mjx-container svg,
.block-math svg {
  display: block;
  margin: 0 auto;
  max-width: 100%;
  height: auto;
}
.table,
table {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
  border: 1px solid #d1d5db;
}
.table-row {
  border-bottom: 1px solid #d1d5db;
}
.table-cell,
td,
th {
  border: 1px solid #d1d5db;
  padding: 0.55em 0.75em;
  vertical-align: top;
  word-break: break-word;
}
.table tr:first-child .table-cell {
  font-weight: 600;
  background: #f8fafc;
}
.callout {
  border-left: 4px solid #d1d5db;
  border-radius: 8px;
  padding: 0.75em 0.9em;
  margin: 1em 0;
  background: #f9fafb;
}
.callout-title {
  display: flex;
  align-items: center;
  gap: 0.45em;
  font-weight: 700;
  margin-bottom: 0.5em;
}
.callout-icon {
  width: 1.1em;
  height: 1.1em;
  flex: 0 0 1.1em;
}
.callout-content {
  margin-top: 0.3em;
}
.callout-warning {
  border-left-color: #eab308;
  background: #fffbea;
}
.callout-danger {
  border-left-color: #ef4444;
  background: #fef2f2;
}
.callout-tip, .callout-info, .callout-note {
  border-left-color: #60a5fa;
  background: #eff6ff;
}
.media-placeholder {
  padding: 0.6em 0.8em;
  border-left: 3px solid #d1d5db;
  background: #f9fafb;
  font-size: 0.95em;
}
.image-placeholder {
  padding: 0.6em 0.8em;
  border-left: 3px solid #f59e0b;
  background: #fffbeb;
  font-size: 0.95em;
}
`.trim();

const XHTML_VOID_TAGS = [
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "param",
  "source",
  "track",
  "wbr",
];

const XHTML_BOOLEAN_ATTRS = [
  "checked",
  "disabled",
  "selected",
  "readonly",
  "multiple",
  "required",
  "autoplay",
  "controls",
  "loop",
  "muted",
  "playsinline",
  "open",
];

const normalizeText = (value?: string) => (value || "").trim();

const escapeXml = (value?: string) => {
  return (value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
};

const sanitizeFileName = (value: string) => {
  const normalized = normalizeText(value) || "未命名文档";
  const sanitized = normalized
    // eslint-disable-next-line no-control-regex
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "_")
    .replace(/\s+/g, " ")
    .trim();
  return sanitized || "未命名文档";
};

const ensureEpubExtension = (fileName: string) => {
  if (/\.epub$/i.test(fileName)) {
    return fileName;
  }
  return `${fileName}.epub`;
};

const toAssetFileName = (value?: string) => {
  if (!value) {
    return "";
  }
  const normalized = value.replace(/\\/g, "/");
  const segments = normalized.split("/");
  return segments[segments.length - 1] || "";
};

const createTextEntryReader = (text: string) => {
  return new Uint8ArrayReader(new TextEncoder().encode(text));
};

const normalizeHtmlFragmentToXhtml = (html: string) => {
  let normalized = html;

  for (const tag of XHTML_VOID_TAGS) {
    const tagRegex = new RegExp(`<${tag}\\b([^>]*)>`, "gi");
    normalized = normalized.replace(tagRegex, (match, rawAttrs: string) => {
      const attrs = String(rawAttrs || "");
      if (match.endsWith("/>")) {
        return match;
      }
      return `<${tag}${attrs} />`;
    });
  }

  for (const attr of XHTML_BOOLEAN_ATTRS) {
    const attrRegex = new RegExp(`\\s${attr}(?=(\\s|/?>))`, "gi");
    normalized = normalized.replace(attrRegex, ` ${attr}="${attr}"`);
  }

  return normalized;
};

const buildChapterFileName = (index: number) => {
  return `text/chapter-${String(index + 1).padStart(3, "0")}.xhtml`;
};

const buildChapterXhtml = (
  chapter: EpubChapter,
  language: string,
  warnings: string[],
) => {
  const rawBody = normalizeText(chapter.xhtml);
  if (!rawBody) {
    warnings.push(
      `章节「${chapter.title || chapter.id}」内容为空，已写入占位段落`,
    );
  }
  const chapterBody = normalizeHtmlFragmentToXhtml(rawBody || "<p></p>");

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="${escapeXml(language)}" lang="${escapeXml(language)}">
  <head>
    <meta charset="UTF-8" />
    <title>${escapeXml(chapter.title)}</title>
    <link rel="stylesheet" type="text/css" href="../styles/book.css" />
  </head>
  <body>
${chapterBody}
  </body>
</html>`;
};

const buildNavXhtml = (
  chapters: Array<{ fileName: string; title: string }>,
  metadata: EpubMetadataInput,
) => {
  const navItems = chapters
    .map(
      (chapter) =>
        `      <li><a href="${escapeXml(chapter.fileName)}">${escapeXml(chapter.title)}</a></li>`,
    )
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="${escapeXml(metadata.language)}" lang="${escapeXml(metadata.language)}">
  <head>
    <meta charset="UTF-8" />
    <title>${escapeXml(metadata.title)} - 目录</title>
    <link rel="stylesheet" type="text/css" href="styles/book.css" />
  </head>
  <body>
    <nav epub:type="toc" id="toc" role="doc-toc">
      <h1>目录</h1>
      <ol>
${navItems}
      </ol>
    </nav>
  </body>
</html>`;
};

const buildTocNcx = (
  chapters: Array<{ fileName: string; title: string }>,
  metadata: EpubMetadataInput,
  bookId: string,
) => {
  const navPoints = chapters
    .map(
      (
        chapter,
        index,
      ) => `    <navPoint id="navPoint-${index + 1}" playOrder="${index + 1}">
      <navLabel><text>${escapeXml(chapter.title)}</text></navLabel>
      <content src="${escapeXml(chapter.fileName)}" />
    </navPoint>`,
    )
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <head>
    <meta name="dtb:uid" content="${escapeXml(bookId)}" />
    <meta name="dtb:depth" content="1" />
    <meta name="dtb:totalPageCount" content="0" />
    <meta name="dtb:maxPageNumber" content="0" />
  </head>
  <docTitle>
    <text>${escapeXml(metadata.title)}</text>
  </docTitle>
  <navMap>
${navPoints}
  </navMap>
</ncx>`;
};

const buildContentOpf = (params: {
  metadata: EpubMetadataInput;
  chapterItems: Array<{ id: string; fileName: string; title: string }>;
  assets: EpubAsset[];
  bookId: string;
  coverAssetId?: string;
}) => {
  const { metadata, chapterItems, assets, bookId, coverAssetId } = params;
  const modifiedAt = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");

  const chapterManifest = chapterItems
    .map(
      (chapter) =>
        `    <item id="${escapeXml(chapter.id)}" href="${escapeXml(chapter.fileName)}" media-type="application/xhtml+xml" />`,
    )
    .join("\n");
  const assetManifest = assets
    .map((asset) => {
      const properties =
        asset.id === coverAssetId ? ' properties="cover-image"' : "";
      return `    <item id="${escapeXml(asset.id)}" href="assets/${escapeXml(asset.fileName)}" media-type="${escapeXml(asset.mimeType || "application/octet-stream")}"${properties} />`;
    })
    .join("\n");
  const spineItems = chapterItems
    .map((chapter) => `    <itemref idref="${escapeXml(chapter.id)}" />`)
    .join("\n");
  const description = normalizeText(metadata.description)
    ? `    <dc:description>${escapeXml(metadata.description)}</dc:description>\n`
    : "";

  return `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:rendition="http://www.idpf.org/vocab/rendition/#" version="3.0" unique-identifier="bookid">
  <metadata>
    <dc:identifier id="bookid">${escapeXml(bookId)}</dc:identifier>
    <dc:title>${escapeXml(metadata.title)}</dc:title>
    <dc:creator>${escapeXml(metadata.author)}</dc:creator>
    <dc:language>${escapeXml(metadata.language)}</dc:language>
${description}    <meta property="dcterms:modified">${modifiedAt}</meta>
    <meta property="rendition:layout">reflowable</meta>
    <meta property="rendition:orientation">auto</meta>
    <meta property="rendition:spread">none</meta>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav" />
    <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml" />
    <item id="style-book" href="styles/book.css" media-type="text/css" />
${chapterManifest}
${assetManifest}
  </manifest>
  <spine toc="ncx">
${spineItems}
  </spine>
</package>`;
};

const buildContainerXml = () => {
  return `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml" />
  </rootfiles>
</container>`;
};

const buildEpubBytes = async (
  payload: EpubExportPayload,
  warnings: string[],
): Promise<Uint8Array> => {
  const bookId = `urn:uuid:${randomUUID()}`;
  const metadata: EpubMetadataInput = {
    title: normalizeText(payload.metadata.title) || "未命名文档",
    author: normalizeText(payload.metadata.author) || "Tau 用户",
    language: normalizeText(payload.metadata.language) || "zh-CN",
    description: normalizeText(payload.metadata.description),
    coverImageSrc: normalizeText(payload.metadata.coverImageSrc) || undefined,
  };

  const inputChapters = payload.chapters.length
    ? payload.chapters
    : [
        {
          id: "chapter-1",
          title: metadata.title,
          xhtml: "<p></p>",
        },
      ];

  if (payload.chapters.length === 0) {
    warnings.push("未提供章节内容，已自动创建空章节");
  }

  const chapterItems = inputChapters.map((chapter, index) => ({
    id: `chapter-${index + 1}`,
    fileName: buildChapterFileName(index),
    title: normalizeText(chapter.title) || `第${index + 1}章`,
    xhtml: buildChapterXhtml(chapter, metadata.language, warnings),
  }));

  const coverFileName = toAssetFileName(metadata.coverImageSrc);
  const coverAsset = payload.assets.find(
    (asset) => asset.fileName === coverFileName,
  );
  if (metadata.coverImageSrc && !coverAsset) {
    warnings.push(`封面资源未找到：${metadata.coverImageSrc}，已忽略封面`);
  }

  const navXhtml = buildNavXhtml(chapterItems, metadata);
  const tocNcx = buildTocNcx(chapterItems, metadata, bookId);
  const contentOpf = buildContentOpf({
    metadata,
    chapterItems,
    assets: payload.assets,
    bookId,
    coverAssetId: coverAsset?.id,
  });

  const zipWriter = new ZipWriter(new Uint8ArrayWriter());
  await zipWriter.add("mimetype", createTextEntryReader(EPUB_MIME_TYPE), {
    level: 0,
  });
  await zipWriter.add(
    "META-INF/container.xml",
    createTextEntryReader(buildContainerXml()),
  );
  await zipWriter.add(
    `${OEBPS_PREFIX}/content.opf`,
    createTextEntryReader(contentOpf),
  );
  await zipWriter.add(
    `${OEBPS_PREFIX}/nav.xhtml`,
    createTextEntryReader(navXhtml),
  );
  await zipWriter.add(`${OEBPS_PREFIX}/toc.ncx`, createTextEntryReader(tocNcx));
  await zipWriter.add(
    `${OEBPS_PREFIX}/styles/book.css`,
    createTextEntryReader(BOOK_CSS),
  );

  for (const chapter of chapterItems) {
    await zipWriter.add(
      `${OEBPS_PREFIX}/${chapter.fileName}`,
      createTextEntryReader(chapter.xhtml),
    );
  }

  for (const asset of payload.assets) {
    await zipWriter.add(
      `${OEBPS_PREFIX}/assets/${asset.fileName}`,
      new Uint8ArrayReader(asset.bytes),
    );
  }

  return await zipWriter.close();
};

export const exportEpubWithDialog = async (
  payload: EpubExportPayload,
): Promise<EpubExportResult> => {
  const warnings: string[] = [];
  const defaultName = ensureEpubExtension(
    sanitizeFileName(
      payload.defaultFileName || payload.metadata.title || "未命名文档",
    ),
  );

  const result = await dialog.showSaveDialog({
    title: "导出 EPUB",
    defaultPath: defaultName,
    filters: [{ name: "EPUB 电子书", extensions: ["epub"] }],
  });

  if (result.canceled || !result.filePath) {
    return {
      canceled: true,
      filePath: null,
      warnings: [],
    };
  }

  const epubBytes = await buildEpubBytes(payload, warnings);
  await writeFile(result.filePath, Buffer.from(epubBytes));

  return {
    canceled: false,
    filePath: result.filePath,
    warnings,
  };
};

export const __epubExporterInternals = {
  buildContentOpf,
  buildNavXhtml,
  buildTocNcx,
  BOOK_CSS,
  normalizeHtmlFragmentToXhtml,
};
