import type { ToolParameterSchema } from "@/types";
import { getFileExtension, readBinaryFile, readTextFile, getHomeDir } from "@/commands/file";
import { nodeFetch } from "@/commands/extra";
import { resolveLocalMediaPath } from "@/utils/localMediaPath";
import type { MCPProviderDefinition } from "./types";

const IMAGE_MIME_BY_EXTENSION: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
};

const SUPPORTED_IMAGE_MIME_TYPES = new Set(Object.values(IMAGE_MIME_BY_EXTENSION));

const parseImageDataUrl = (value: string) => {
  const match = value.match(/^data:([^;]+);base64,(.+)$/i);
  if (!match) {
    throw new Error("仅支持 base64 编码的 data:image 图片");
  }
  const mimeType = match[1].toLowerCase().replace("image/jpg", "image/jpeg");
  if (!SUPPORTED_IMAGE_MIME_TYPES.has(mimeType)) {
    throw new Error("图片格式不受支持，仅支持 png、jpeg、webp、gif");
  }
  const base64 = match[2];
  return {
    base64,
    mimeType,
    byteLength: Math.floor((base64.length * 3) / 4),
    dataUrl: `data:${mimeType};base64,${base64}`,
  };
};

const bytesToBase64 = (bytes: Uint8Array) => {
  let binary = "";
  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index]);
  }
  return btoa(binary);
};

const readRemoteImage = async (url: string) => {
  const response = (await nodeFetch(url, {
    method: "GET",
    responseType: "arraybuffer",
    isRaw: true,
  })) as { data?: ArrayBuffer | Uint8Array; headers?: Record<string, string> };
  const data = response.data ?? (response as unknown as ArrayBuffer);
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  const contentType =
    response.headers?.["content-type"] || response.headers?.["Content-Type"] || "";
  const mimeType = contentType
    .split(";")[0]
    .trim()
    .toLowerCase()
    .replace("image/jpg", "image/jpeg");
  if (!SUPPORTED_IMAGE_MIME_TYPES.has(mimeType)) {
    throw new Error("远程图片格式不受支持，仅支持 png、jpeg、webp、gif");
  }
  const base64 = bytesToBase64(bytes);
  return {
    base64,
    mimeType,
    byteLength: bytes.byteLength,
    dataUrl: `data:${mimeType};base64,${base64}`,
  };
};

const readLocalImage = async (path: string) => {
  const extension = (await getFileExtension(path)).toLowerCase().replace(/^\./, "");
  const mimeType = IMAGE_MIME_BY_EXTENSION[extension];
  if (!mimeType) {
    throw new Error("本地图片格式不受支持，仅支持 png、jpeg、webp、gif");
  }
  const bytes = (await readBinaryFile(path)) as Uint8Array;
  const base64 = bytesToBase64(bytes);
  return {
    base64,
    mimeType,
    byteLength: bytes.byteLength,
    dataUrl: `data:${mimeType};base64,${base64}`,
  };
};

export const filesystemToolsProvider: MCPProviderDefinition = {
  id: "filesystem-tools",
  name: "文件系统工具",
  description: "提供文件与图片读取工具，支持读取纯文本文件，并可读取本地或远程图片供模型视觉分析。",
  defaultEnabled: true,
  tools: () => [
    {
      name: "read_file",
      description:
        "读取指定路径的纯文本文件内容。支持读取任意路径的文件，包括 Skill " +
        "目录下的模板、示例等文件。对于二进制文件会返回错误。" +
        "可以设置 maxLength 参数限制读取的字符数，避免内容过长。",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "文件的绝对路径，支持使用 ~ 表示用户家目录",
          },
          maxLength: {
            type: "number",
            description: "可选，最大读取字符数。默认无限制，建议设置为 50000 避免内容过长",
          },
        } as Record<string, ToolParameterSchema>,
        required: ["path"],
        additionalProperties: false,
      },
      executor: async args => {
        const path = args.path as string;
        const maxLength = args.maxLength as number | undefined;

        // 验证路径
        if (!path || typeof path !== "string") {
          return {
            content: JSON.stringify(
              {
                success: false,
                error: "必须提供有效的文件路径",
              },
              null,
              2
            ),
          };
        }

        // 解析 ~ 为家目录
        let resolvedPath = path;
        if (path.startsWith("~")) {
          const homeDir = await getHomeDir();
          resolvedPath = path.replace(/^~/, homeDir);
        }

        try {
          let content = await readTextFile(resolvedPath);
          let truncated = false;
          const originalLength = content.length;

          if (maxLength && content.length > maxLength) {
            content = content.substring(0, maxLength);
            truncated = true;
          }

          return {
            content: JSON.stringify(
              {
                success: true,
                path: resolvedPath,
                content,
                truncated,
                ...(truncated
                  ? {
                      originalLength,
                      truncatedLength: maxLength,
                    }
                  : {}),
              },
              null,
              2
            ),
          };
        } catch (error) {
          return {
            content: JSON.stringify(
              {
                success: false,
                path: resolvedPath,
                error: `读取文件失败: ${(error as Error).message}`,
              },
              null,
              2
            ),
          };
        }
      },
    },
    {
      name: "read_image",
      description:
        "读取指定图片路径并返回模型可见的图片内容。支持本地路径、file://、~、相对路径、远程 URL 和 data:image base64；适合在 generate_image 后读取图片进行视觉检查。",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description:
              "图片路径或 URL。可传 generate_image 返回的 images[].url，也可传本地路径、file://、~、相对路径或 data:image。",
          },
        } as Record<string, ToolParameterSchema>,
        required: ["path"],
        additionalProperties: false,
      },
      executor: async args => {
        const rawPath = args.path;
        if (typeof rawPath !== "string" || !rawPath.trim()) {
          return {
            content: JSON.stringify(
              {
                success: false,
                error: "必须提供有效的图片路径",
              },
              null,
              2
            ),
            isParameterError: true,
          };
        }

        try {
          const path = rawPath.trim();
          const resolvedPath = await resolveLocalMediaPath(path);
          const image = resolvedPath.startsWith("data:")
            ? parseImageDataUrl(resolvedPath)
            : /^https?:\/\//i.test(resolvedPath)
              ? await readRemoteImage(resolvedPath)
              : await readLocalImage(resolvedPath);
          const summary = {
            success: true,
            path,
            resolvedPath,
            mimeType: image.mimeType,
            byteLength: image.byteLength,
            dataUrlLength: image.dataUrl.length,
          };
          const text = `已读取图片 ${resolvedPath}，格式 ${image.mimeType}，大小 ${image.byteLength} bytes。`;

          return {
            content: JSON.stringify(summary, null, 2),
            modelContent: [
              { type: "text", text },
              { type: "image", image: image.dataUrl },
            ],
          };
        } catch (error) {
          return {
            content: JSON.stringify(
              {
                success: false,
                path: rawPath,
                error: `读取图片失败: ${(error as Error).message}`,
              },
              null,
              2
            ),
            isParameterError: true,
          };
        }
      },
    },
  ],
};
