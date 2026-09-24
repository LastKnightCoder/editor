import { ResourceFileType } from "@/types";

export const LOCAL_RESOURCE_DIR = "resources";

const createExtSet = (list: string[]) => new Set(list);

export const IMAGE_EXTENSIONS = createExtSet([
  "png",
  "jpg",
  "jpeg",
  "gif",
  "bmp",
  "webp",
  "svg",
  "avif",
  "heic",
  "ico",
]);

export const VIDEO_EXTENSIONS = createExtSet(["mp4", "mov", "mkv", "webm", "avi", "flv"]);

export const AUDIO_EXTENSIONS = createExtSet(["mp3", "m4a", "aac", "wav", "ogg", "flac"]);

const PDF_EXTENSIONS = createExtSet(["pdf"]);
const EPUB_EXTENSIONS = createExtSet(["epub"]);

export const inferPreviewType = (
  fileName: string
): Extract<ResourceFileType, "image" | "video" | "audio"> | null => {
  const ext = fileName.split(".").pop()?.toLowerCase() || "";
  if (IMAGE_EXTENSIONS.has(ext)) return "image";
  if (VIDEO_EXTENSIONS.has(ext)) return "video";
  if (AUDIO_EXTENSIONS.has(ext)) return "audio";
  return null;
};

export const inferResourceFileType = (fileName: string): ResourceFileType | null => {
  const ext = fileName.split(".").pop()?.toLowerCase() || "";
  if (IMAGE_EXTENSIONS.has(ext)) return "image";
  if (VIDEO_EXTENSIONS.has(ext)) return "video";
  if (AUDIO_EXTENSIONS.has(ext)) return "audio";
  if (PDF_EXTENSIONS.has(ext)) return "pdf";
  if (EPUB_EXTENSIONS.has(ext)) return "epub";
  if (ext) return "attachment";
  return null;
};
