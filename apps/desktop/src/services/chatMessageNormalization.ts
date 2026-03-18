import type { MessageContent, RequestMessage } from "@/types";
import { getResourceById, getHomeDir, readBinaryFile } from "@/commands";
import { remoteResourceToLocal } from "@/utils";

const FILE_MIME_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  bmp: "image/bmp",
  svg: "image/svg+xml",
  avif: "image/avif",
  jfif: "image/jpeg",
  ico: "image/x-icon",
};

const guessMimeTypeFromPath = (path: string) => {
  if (!path) {
    return "application/octet-stream";
  }
  const match = /\.([a-z0-9]+)(?:\?.*)?$/i.exec(path);
  if (match) {
    const ext = match[1].toLowerCase();
    return FILE_MIME_TYPES[ext] || "application/octet-stream";
  }
  return "application/octet-stream";
};

const readBlobAsDataURL = (blob: Blob) => {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
};

const binaryToDataURL = async (binary: BlobPart, mimeType: string) => {
  const blob = new Blob([binary], { type: mimeType });
  return await readBlobAsDataURL(blob);
};

const fetchUrlAsBase64 = async (url: string) => {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`获取资源失败: ${response.status}`);
  }
  const blob = await response.blob();
  return await readBlobAsDataURL(blob);
};

const tryConvertUrlToBase64 = async (url?: string | null) => {
  if (!url) {
    return null;
  }
  if (url.startsWith("data:")) {
    return url;
  }
  try {
    return await fetchUrlAsBase64(url);
  } catch (error) {
    console.error("转换图片为 Base64 失败:", error);
    return url;
  }
};

const resolveResourceAbsolutePath = async (resourcePath: string) => {
  if (!resourcePath) {
    return null;
  }

  if (/^https?:/i.test(resourcePath)) {
    try {
      return await remoteResourceToLocal(resourcePath);
    } catch (error) {
      console.error("下载远程资源失败:", error);
      return null;
    }
  }

  if (resourcePath.startsWith("~")) {
    const homeDir = await getHomeDir();
    return `${homeDir}${resourcePath.slice(1)}`;
  }

  return resourcePath;
};

const buildResourceDataUrl = async (
  resourceId?: number,
  fallbackPath?: string,
  fallbackName?: string,
): Promise<string | null> => {
  const convertFromPath = async (
    path: string,
    nameHint?: string,
    forcedMime?: string,
  ) => {
    try {
      const absolutePath = await resolveResourceAbsolutePath(path);
      if (absolutePath) {
        const binary = await readBinaryFile(absolutePath);
        let mimeType =
          forcedMime ||
          guessMimeTypeFromPath(path) ||
          "application/octet-stream";
        if (mimeType === "application/octet-stream" && nameHint) {
          const guessedFromName = guessMimeTypeFromPath(nameHint);
          if (
            guessedFromName &&
            guessedFromName !== "application/octet-stream"
          ) {
            mimeType = guessedFromName;
          }
        }
        return await binaryToDataURL(binary as BlobPart, mimeType);
      }
      return await tryConvertUrlToBase64(path);
    } catch (error) {
      console.error("读取资源失败:", error);
      return await tryConvertUrlToBase64(path);
    }
  };

  if (resourceId) {
    try {
      const resource = await getResourceById(resourceId);
      if (resource) {
        const forcedMime =
          resource.type === "pdf" ? "application/pdf" : undefined;
        const result = await convertFromPath(
          resource.path,
          resource.name,
          forcedMime,
        );
        if (result) {
          return result;
        }
      }
    } catch (error) {
      console.error("获取资源失败:", error);
    }
  }

  if (fallbackPath) {
    const fallbackMime =
      fallbackName && fallbackName.toLowerCase().endsWith(".pdf")
        ? "application/pdf"
        : undefined;
    return await convertFromPath(fallbackPath, fallbackName, fallbackMime);
  }

  return null;
};

const buildImageBase64 = async (
  resourceId?: number,
  fallbackUrl?: string,
): Promise<string | null> => {
  return await buildResourceDataUrl(resourceId, fallbackUrl);
};

const buildFileBase64 = async (
  resourceId?: number,
  fallbackPath?: string,
  fallbackName?: string,
): Promise<string | null> => {
  return await buildResourceDataUrl(resourceId, fallbackPath, fallbackName);
};

const normalizeMessageContent = async (
  message: RequestMessage,
): Promise<RequestMessage> => {
  if (!Array.isArray(message.content)) {
    return message;
  }

  const normalized: MessageContent[] = [];
  for (const item of message.content) {
    if (item.type === "image") {
      const imageData = await buildImageBase64(item.resourceId, item.image);
      normalized.push(
        imageData
          ? {
              ...item,
              image: imageData,
            }
          : item,
      );
    } else if (item.type === "file") {
      const fileData = await buildFileBase64(
        item.resourceId,
        item.file,
        item.fileName,
      );
      normalized.push(
        fileData
          ? {
              ...item,
              file: fileData,
            }
          : item,
      );
    } else {
      normalized.push(item);
    }
  }

  return {
    ...message,
    content: normalized,
  };
};

export const normalizeRequestMessages = async (
  messages: RequestMessage[],
): Promise<RequestMessage[]> => {
  const normalized: RequestMessage[] = [];
  for (const message of messages) {
    normalized.push(await normalizeMessageContent(message));
  }
  return normalized;
};
