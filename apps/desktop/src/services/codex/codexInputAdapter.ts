import { getHomeDir, getResourceById } from "@/commands";
import type { MessageContent } from "@/types";
import { remoteResourceToLocal } from "@/utils";

export type CodexInputItem =
  | {
      type: "text";
      text: string;
    }
  | {
      type: "local_image";
      path: string;
    };

const isLocalPath = (path: string) => {
  if (!path.trim()) {
    return false;
  }
  if (/^(https?|data|blob|file|app):/i.test(path)) {
    return false;
  }
  return true;
};

const isRemotePath = (path: string) => /^https?:/i.test(path);

const resolveHomePath = async (path: string) => {
  if (!path.startsWith("~")) {
    return path;
  }
  const homeDir = await getHomeDir();
  return `${homeDir}${path.slice(1)}`;
};

const resolveLocalImagePath = async (
  item: Extract<MessageContent, { type: "image" }>,
) => {
  if (item.path && isLocalPath(item.path)) {
    return await resolveHomePath(item.path);
  }

  if (item.resourceId) {
    const resource = await getResourceById(item.resourceId);
    if (resource?.path && isLocalPath(resource.path)) {
      return await resolveHomePath(resource.path);
    }
    if (resource?.path && isRemotePath(resource.path)) {
      return await resolveHomePath(
        await remoteResourceToLocal(resource.path, resource.name),
      );
    }
  }

  if (item.image && isLocalPath(item.image)) {
    return await resolveHomePath(item.image);
  }
  if (item.image && isRemotePath(item.image)) {
    return await resolveHomePath(await remoteResourceToLocal(item.image));
  }

  return null;
};

export const buildCodexInputFromMessageContent = async (
  content: MessageContent[] | string,
): Promise<CodexInputItem[]> => {
  if (typeof content === "string") {
    const text = content.trim();
    return text ? [{ type: "text", text }] : [];
  }

  const textParts: string[] = [];
  const images: CodexInputItem[] = [];

  for (const item of content) {
    if (item.type === "text") {
      const text = item.text.trim();
      if (text) {
        textParts.push(text);
      }
      continue;
    }

    if (item.type === "image") {
      const localPath = await resolveLocalImagePath(item);
      if (!localPath) {
        throw new Error(
          "Codex 需要本地图片文件路径。请使用本地上传的图片，或先把远程图片保存为本地资源。",
        );
      }
      images.push({
        type: "local_image",
        path: localPath,
      });
    }
  }

  return [
    ...(textParts.length > 0
      ? [{ type: "text" as const, text: textParts.join("\n\n") }]
      : []),
    ...images,
  ];
};
