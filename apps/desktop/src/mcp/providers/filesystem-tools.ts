import type { ToolParameterSchema } from "@/types";
import { desktopFetch } from "@/commands/fetch";
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
  const response = await desktopFetch(url);
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error(`图片下载失败: ${response.status}`);
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  const contentType = response.headers.get("content-type") ?? "";
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

export const filesystemToolsProvider: MCPProviderDefinition = {
  id: "filesystem-tools",
  name: "图片读取工具",
  description:
    "读取远程 URL 或 data:image 图片供 AI 视觉分析（如 generate_image 后的视觉自检）。本地图片与文本文件由 AI 自带的 read 工具读取。",
  defaultEnabled: true,
  tools: () => [
    {
      name: "read_image",
      risk: "read",
      description:
        "读取远程图片 URL 或 data:image base64 并返回模型可见的图片内容；适合在 generate_image 后读取图片进行视觉检查。本地图片文件请改用 read 工具。",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description:
              "图片的 http(s) URL 或 data:image base64，可传 generate_image 返回的 images[].url",
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
                error: "必须提供有效的图片 URL",
              },
              null,
              2
            ),
            isParameterError: true,
          };
        }

        const path = rawPath.trim();
        try {
          const image = path.startsWith("data:")
            ? parseImageDataUrl(path)
            : /^https?:\/\//i.test(path)
              ? await readRemoteImage(path)
              : null;
          if (!image) {
            return {
              content: JSON.stringify(
                {
                  success: false,
                  path,
                  error: "仅支持 http(s) URL 与 data:image 图片；读取本地图片文件请使用 read 工具",
                },
                null,
                2
              ),
              isParameterError: true,
            };
          }
          const summary = {
            success: true,
            path,
            mimeType: image.mimeType,
            byteLength: image.byteLength,
            dataUrlLength: image.dataUrl.length,
          };
          const text = `已读取图片 ${path}，格式 ${image.mimeType}，大小 ${image.byteLength} bytes。`;

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
