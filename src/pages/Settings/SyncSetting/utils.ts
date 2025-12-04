import { IResource, ResourceType } from "@/types";

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

export const VIDEO_EXTENSIONS = createExtSet([
  "mp4",
  "mov",
  "mkv",
  "webm",
  "avi",
  "flv",
]);

export const AUDIO_EXTENSIONS = createExtSet([
  "mp3",
  "m4a",
  "aac",
  "wav",
  "ogg",
  "flac",
]);

const PDF_EXTENSIONS = createExtSet(["pdf"]);
const EPUB_EXTENSIONS = createExtSet(["epub"]);

export const matchResourceByName = (
  resources: IResource[],
  fileName: string,
) => {
  if (!fileName) return null;
  const normalized = fileName.toLowerCase();
  for (const resource of resources) {
    const nameLower = resource.name.toLowerCase();
    const pathLower = resource.path.toLowerCase();
    if (
      resource.name === fileName ||
      resource.path === fileName ||
      nameLower === normalized ||
      pathLower === normalized ||
      normalized.endsWith(nameLower) ||
      pathLower.endsWith(normalized)
    ) {
      return resource;
    }
  }
  return null;
};

export const inferPreviewType = (
  fileName: string,
): Extract<ResourceType, "image" | "video" | "audio"> | null => {
  const ext = fileName.split(".").pop()?.toLowerCase() || "";
  if (IMAGE_EXTENSIONS.has(ext)) return "image";
  if (VIDEO_EXTENSIONS.has(ext)) return "video";
  if (AUDIO_EXTENSIONS.has(ext)) return "audio";
  return null;
};

export const inferResourceType = (fileName: string): ResourceType | null => {
  const ext = fileName.split(".").pop()?.toLowerCase() || "";
  if (IMAGE_EXTENSIONS.has(ext)) return "image";
  if (VIDEO_EXTENSIONS.has(ext)) return "video";
  if (AUDIO_EXTENSIONS.has(ext)) return "audio";
  if (PDF_EXTENSIONS.has(ext)) return "pdf";
  if (EPUB_EXTENSIONS.has(ext)) return "epub";
  if (ext) return "attachment";
  return null;
};
