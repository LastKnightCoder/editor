import { getFileExtension, readBinaryFile } from "@/commands/file";
import { desktopFetch } from "@/commands/fetch";
import { resolveLocalMediaPath } from "../localMediaPath";

export interface ResolvedImageInputFile extends File {
  resolvedPath?: string;
}

export interface ImageInputFileDependencies {
  fetchBinary?: (
    url: string,
    signal?: AbortSignal
  ) => Promise<{ data: Uint8Array; mimeType: string }>;
  readBinaryFile?: typeof readBinaryFile;
  resolveLocalMediaPath?: typeof resolveLocalMediaPath;
  getFileExtension?: typeof getFileExtension;
}

// ====================== MIME maps ======================

const MIME_BY_EXTENSION: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
};

const EXTENSION_BY_MIME: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

// ====================== Helpers ======================

const extensionFromMimeType = (mimeType: string) => EXTENSION_BY_MIME[mimeType];

const mimeTypeFromExtension = (extension: string) =>
  MIME_BY_EXTENSION[extension.toLowerCase().replace(/^\./, "")];

// ====================== Public utilities ======================

export const parseDataUrl = (value: string) => {
  const match = value.match(/^data:(image\/(?:png|jpeg|jpg|webp));base64,(.+)$/i);
  if (!match) {
    throw new Error("仅支持 png、jpeg、webp 格式的 data URL 图片");
  }
  const mimeType = match[1].toLowerCase().replace("image/jpg", "image/jpeg");
  const binary = atob(match[2]);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return { bytes, mimeType };
};

export const createImageFile = (
  bytes: Uint8Array,
  mimeType: string,
  prefix = "input-image"
): ResolvedImageInputFile => {
  const extension = extensionFromMimeType(mimeType);
  if (!extension) {
    throw new Error("仅支持 png、jpeg、webp 格式的图片");
  }
  // 入参字节均来自 IPC 或新构造的 Uint8Array，必为 ArrayBuffer 背景
  const file = new File(
    [bytes as Uint8Array<ArrayBuffer>],
    `${prefix}-${Date.now()}.${extension}`,
    {
      type: mimeType,
    }
  );
  if (typeof file.arrayBuffer !== "function") {
    Object.defineProperty(file, "arrayBuffer", {
      value: async () => bytes.buffer.slice(0),
    });
  }
  return file;
};

export const fetchRemoteImage = async (url: string, signal?: AbortSignal) => {
  const response = await desktopFetch(url, { signal });
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error(`图片下载失败: ${response.status}`);
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  const contentType = response.headers.get("content-type") ?? "";
  const mimeType = contentType.split(";")[0].trim().toLowerCase();
  if (!extensionFromMimeType(mimeType)) {
    throw new Error("远程图片格式不受支持，仅支持 png、jpeg、webp");
  }
  return { data: bytes, mimeType };
};

export const resolveImageInputFile = async (
  rawValue: string,
  dependencies: ImageInputFileDependencies = {},
  signal?: AbortSignal
): Promise<ResolvedImageInputFile> => {
  signal?.throwIfAborted();
  const value = rawValue.trim();
  if (!value) {
    throw new Error("图片路径不能为空");
  }

  if (value.startsWith("data:")) {
    const { bytes, mimeType } = parseDataUrl(value);
    return createImageFile(bytes, mimeType);
  }

  if (/^https?:\/\//i.test(value)) {
    const { data, mimeType } = await (dependencies.fetchBinary ?? fetchRemoteImage)(value, signal);
    signal?.throwIfAborted();
    return createImageFile(data, mimeType);
  }

  const localPath = await (dependencies.resolveLocalMediaPath ?? resolveLocalMediaPath)(value);
  const extension = await (dependencies.getFileExtension ?? getFileExtension)(localPath);
  const mimeType = mimeTypeFromExtension(extension);
  if (!mimeType) {
    throw new Error("本地图片格式不受支持，仅支持 png、jpeg、webp");
  }

  const bytes = await (dependencies.readBinaryFile ?? readBinaryFile)(localPath);
  signal?.throwIfAborted();
  const file = createImageFile(bytes, mimeType);
  file.resolvedPath = localPath;
  return file;
};
