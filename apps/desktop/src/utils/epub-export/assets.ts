import { readBinaryFile } from "@/commands";
import type { EpubAsset, EpubChapter } from "@/types";
import { resolveLocalMediaPath } from "@/utils/localMediaPath";
import { remoteResourceToLocal } from "@/utils/resouce";

const IMAGE_MIME_TO_EXTENSION: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/bmp": "bmp",
  "image/svg+xml": "svg",
  "image/avif": "avif",
};

const IMAGE_EXTENSION_TO_MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  bmp: "image/bmp",
  svg: "image/svg+xml",
  avif: "image/avif",
};

export interface ProcessEpubAssetsInput {
  chapters: EpubChapter[];
  coverImageSrc?: string;
}

export interface ProcessEpubAssetsResult {
  chapters: EpubChapter[];
  assets: EpubAsset[];
  coverImageSrc?: string;
  warnings: string[];
}

export interface EpubAssetDependencies {
  remoteResourceToLocal: typeof remoteResourceToLocal;
  resolveLocalMediaPath: typeof resolveLocalMediaPath;
  readBinaryFile: typeof readBinaryFile;
}

const DEFAULT_DEPENDENCIES: EpubAssetDependencies = {
  remoteResourceToLocal,
  resolveLocalMediaPath,
  readBinaryFile,
};

const normalize = (value?: string) => (value || "").trim();

const isDataUri = (value: string) => value.startsWith("data:");
const isHttpUrl = (value: string) => /^https?:\/\//i.test(value);

const getUrlExtension = (value: string) => {
  const cleanValue = value.split("#")[0].split("?")[0];
  const slashIndex = cleanValue.lastIndexOf("/");
  const fileName =
    slashIndex >= 0 ? cleanValue.slice(slashIndex + 1) : cleanValue;
  const dotIndex = fileName.lastIndexOf(".");
  if (dotIndex < 0 || dotIndex === fileName.length - 1) {
    return "";
  }
  return fileName.slice(dotIndex + 1).toLowerCase();
};

const decodeBase64ToBytes = (base64: string) => {
  if (typeof atob === "function") {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }

  const globalBuffer = (globalThis as unknown as { Buffer?: typeof Buffer })
    .Buffer;
  if (globalBuffer) {
    return new Uint8Array(globalBuffer.from(base64, "base64"));
  }
  throw new Error("当前环境不支持 base64 解码");
};

const parseDataUri = (
  dataUri: string,
): { mimeType: string; bytes: Uint8Array } => {
  const commaIndex = dataUri.indexOf(",");
  if (commaIndex < 0) {
    throw new Error("无效的 data URI");
  }

  const header = dataUri.slice(5, commaIndex);
  const payload = dataUri.slice(commaIndex + 1);
  const mimeType =
    normalize(header.split(";")[0]) || "application/octet-stream";
  const isBase64 = /;base64/i.test(header);

  if (isBase64) {
    return {
      mimeType,
      bytes: decodeBase64ToBytes(payload),
    };
  }

  return {
    mimeType,
    bytes: new TextEncoder().encode(decodeURIComponent(payload)),
  };
};

const getImageMimeType = (src: string, dataMimeType?: string) => {
  if (dataMimeType && dataMimeType.startsWith("image/")) {
    return dataMimeType.toLowerCase();
  }
  const ext = getUrlExtension(src);
  return IMAGE_EXTENSION_TO_MIME[ext] || "image/png";
};

const getImageExtension = (mimeType: string, src: string) => {
  const fromMime = IMAGE_MIME_TO_EXTENSION[mimeType.toLowerCase()];
  if (fromMime) {
    return fromMime;
  }
  const fromSrc = getUrlExtension(src);
  if (fromSrc) {
    return fromSrc;
  }
  return "png";
};

const stripLtohProtocol = (value: string) => {
  const prefix = "ltoh:///";
  if (!value.startsWith(prefix)) {
    return value;
  }
  return decodeURIComponent(value.slice(prefix.length));
};

const createMediaPlaceholder = (doc: Document, source?: string) => {
  const paragraph = doc.createElement("p");
  paragraph.className = "media-placeholder";

  const notePrefix = doc.createTextNode("媒体资源（EPUB 中保留为链接）：");
  paragraph.appendChild(notePrefix);

  if (source) {
    const link = doc.createElement("a");
    link.href = source;
    link.textContent = source;
    link.target = "_blank";
    link.rel = "noreferrer";
    paragraph.appendChild(doc.createTextNode(" "));
    paragraph.appendChild(link);
  } else {
    paragraph.appendChild(doc.createTextNode("原始地址缺失"));
  }

  return paragraph;
};

const createImagePlaceholder = (doc: Document, source?: string) => {
  const paragraph = doc.createElement("p");
  paragraph.className = "image-placeholder";
  paragraph.appendChild(doc.createTextNode("图片资源加载失败："));

  if (source) {
    const link = doc.createElement("a");
    link.href = source;
    link.textContent = source;
    link.target = "_blank";
    link.rel = "noreferrer";
    paragraph.appendChild(link);
  } else {
    paragraph.appendChild(doc.createTextNode("原始地址缺失"));
  }

  return paragraph;
};

const extractMediaSource = (element: Element) => {
  const directSrc = normalize(element.getAttribute("src") || "");
  if (directSrc) {
    return directSrc;
  }

  const sourceNode = element.querySelector("source[src]");
  if (!sourceNode) {
    return "";
  }
  return normalize(sourceNode.getAttribute("src") || "");
};

export const processEpubAssets = async (
  input: ProcessEpubAssetsInput,
  dependencies: EpubAssetDependencies = DEFAULT_DEPENDENCIES,
): Promise<ProcessEpubAssetsResult> => {
  const warnings: string[] = [];
  const assets: EpubAsset[] = [];
  const assetBySource = new Map<string, { fileName: string; id: string }>();
  let assetIndex = 1;

  const ensureImageAsset = async (src: string, contextLabel: string) => {
    const rawSrc = normalize(src);
    if (!rawSrc) {
      warnings.push(`${contextLabel}：图片地址为空，已跳过`);
      return null;
    }

    if (assetBySource.has(rawSrc)) {
      return assetBySource.get(rawSrc)!;
    }

    try {
      let bytes: Uint8Array;
      let mimeType = "image/png";

      if (isDataUri(rawSrc)) {
        const parsed = parseDataUri(rawSrc);
        if (!parsed.mimeType.startsWith("image/")) {
          warnings.push(
            `${contextLabel}：仅支持图片 data URI，已跳过 ${rawSrc}`,
          );
          return null;
        }
        bytes = parsed.bytes;
        mimeType = getImageMimeType(rawSrc, parsed.mimeType);
      } else {
        const resolvedSrc = await dependencies.resolveLocalMediaPath(rawSrc);
        const resolvedValue = normalize(resolvedSrc || rawSrc);

        let localPath = resolvedValue;
        if (isHttpUrl(resolvedValue)) {
          localPath = await dependencies.remoteResourceToLocal(resolvedValue);
        }

        localPath = stripLtohProtocol(localPath);
        bytes = await dependencies.readBinaryFile(localPath);
        mimeType = getImageMimeType(rawSrc);
      }

      const extension = getImageExtension(mimeType, rawSrc);
      const fileName = `image-${assetIndex}.${extension}`;
      const id = `asset-image-${assetIndex}`;
      assetIndex += 1;

      assets.push({
        id,
        fileName,
        mimeType,
        bytes,
      });
      const assetRef = { id, fileName };
      assetBySource.set(rawSrc, assetRef);
      return assetRef;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      warnings.push(`${contextLabel}：图片处理失败（${rawSrc}），原因：${msg}`);
      return null;
    }
  };

  const processedChapters: EpubChapter[] = [];
  for (const [chapterIndex, chapter] of input.chapters.entries()) {
    const doc = new DOMParser().parseFromString(
      `<div id="epub-chapter-root">${chapter.xhtml || ""}</div>`,
      "text/html",
    );
    const root = doc.getElementById("epub-chapter-root");
    if (!root) {
      processedChapters.push(chapter);
      continue;
    }

    const images = Array.from(root.querySelectorAll("img[src]"));
    for (const image of images) {
      const src = image.getAttribute("src");
      const asset = await ensureImageAsset(
        src || "",
        `章节 ${chapterIndex + 1}（${chapter.title}）`,
      );
      if (!asset) {
        const placeholder = createImagePlaceholder(doc, normalize(src || ""));
        image.replaceWith(placeholder);
        continue;
      }

      image.setAttribute("src", `../assets/${asset.fileName}`);
      image.removeAttribute("srcset");
    }

    const mediaElements = Array.from(
      root.querySelectorAll("audio,video,iframe"),
    );
    for (const mediaElement of mediaElements) {
      const mediaSrc = extractMediaSource(mediaElement);
      const placeholder = createMediaPlaceholder(doc, mediaSrc);
      mediaElement.replaceWith(placeholder);
    }

    processedChapters.push({
      ...chapter,
      xhtml: root.innerHTML.trim() || "<p></p>",
    });
  }

  let processedCoverImageSrc: string | undefined;
  if (normalize(input.coverImageSrc)) {
    const coverAsset = await ensureImageAsset(
      input.coverImageSrc as string,
      "封面图",
    );
    processedCoverImageSrc = coverAsset
      ? `assets/${coverAsset.fileName}`
      : undefined;
    if (!coverAsset && input.coverImageSrc) {
      warnings.push("封面图处理失败，已自动忽略封面");
    }
  }

  return {
    chapters: processedChapters,
    assets,
    coverImageSrc: processedCoverImageSrc,
    warnings,
  };
};
