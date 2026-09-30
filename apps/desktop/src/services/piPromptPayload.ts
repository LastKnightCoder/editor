import type { MessageContent } from "@/types";

interface PromptPayloadOptions {
  includeImages?: boolean;
  resolveRemoteFile: (url: string, fileName?: string) => Promise<string>;
}

export async function buildPiPromptPayload(
  content: MessageContent[],
  { includeImages = true, resolveRemoteFile }: PromptPayloadOptions
) {
  const files = await Promise.all(
    content
      .filter(item => item.type === "file")
      .map(async item => {
        const path = /^https?:\/\//i.test(item.file)
          ? await resolveRemoteFile(item.file, item.fileName)
          : item.file;
        return `[文件：${item.fileName ?? item.file}]\n路径：${path}\n请使用 pi 的 read 工具读取该文件。`;
      })
  );
  return {
    promptText: [
      ...content.filter(item => item.type === "text").map(item => item.text),
      ...files,
    ].join("\n"),
    images: includeImages
      ? content
          .filter(item => item.type === "image")
          .map(item =>
            item.image.startsWith("data:")
              ? { dataUrl: item.image }
              : { path: item.path ?? item.image }
          )
      : [],
  };
}

export const normalizePiSystemPrompt = (text: string): string =>
  text.includes("<TAU_CODEX_CONTEXT>")
    ? text.replace(/<TAU_CODEX_CONTEXT>[\s\S]*?<\/TAU_CODEX_CONTEXT>\r?\n?/g, "").trimEnd()
    : text;
