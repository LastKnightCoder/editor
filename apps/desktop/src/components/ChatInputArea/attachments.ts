import { v4 as uuid } from "uuid";
import { convertFileSrc, getHomeDir, isDirectory } from "@/commands";
import { copyFileToLocal } from "@/utils/resouce";

const MAX_FILE_SIZE = 50 * 1024 * 1024;
const imageExtensions: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/bmp": "bmp",
};

export const CHAT_IMAGE_ACCEPT = Object.keys(imageExtensions).join(", ");

export class ChatAttachmentError extends Error {
  constructor(
    public readonly code:
      | "attachment.audioVideo"
      | "attachment.imageFormat"
      | "attachment.tooLarge"
      | "attachment.directory"
      | "attachment.path",
    message: string,
    public readonly params?: { name: string }
  ) {
    super(message);
    this.name = "ChatAttachmentError";
  }
}

export type ChatAttachment =
  | { type: "image"; id: string; name: string; path: string; previewUrl: string }
  | { type: "file"; id: string; name: string; path: string };

export async function prepareChatAttachment(
  file: File,
  source: "pick" | "drop" | "paste",
  supportsImages: boolean,
  supportsFiles: boolean
): Promise<ChatAttachment> {
  const imageExtension = imageExtensions[file.type.toLowerCase()];
  const asImage = supportsImages && !!imageExtension;
  if (/^(audio|video)\//i.test(file.type))
    throw new ChatAttachmentError("attachment.audioVideo", "暂不支持音视频文件");
  if (!asImage && !supportsFiles)
    throw new ChatAttachmentError("attachment.imageFormat", "请选择支持的图片格式");
  if (!asImage && file.size > MAX_FILE_SIZE)
    throw new ChatAttachmentError("attachment.tooLarge", "文件需小于或等于 50 MB");

  const id = uuid();
  let path = window.electron?.getPathForFile?.(file);
  if (path) {
    if (await isDirectory(path))
      throw new ChatAttachmentError("attachment.directory", "请选择文件，暂不支持文件夹");
  } else if (source === "paste" && imageExtension) {
    path = await copyFileToLocal(file, `${id}.${imageExtension}`);
    if (path.startsWith("~/")) path = (await getHomeDir()) + path.slice(1);
  } else {
    throw new ChatAttachmentError(
      "attachment.path",
      `无法取得「${file.name}」的本地路径，请从文件夹选择或拖入`,
      { name: file.name }
    );
  }

  if (asImage) {
    return { type: "image", id, name: file.name, path, previewUrl: await convertFileSrc(path) };
  }
  return { type: "file", id, name: file.name, path };
}
