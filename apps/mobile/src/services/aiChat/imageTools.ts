import type { ImageOptions } from "@tau/plugins";
import { Role, type ChatSessionMessage } from "@tau/shared/chat-core";
import type { AiToolExecutionContext } from "@tau/ai/contracts";
import { generateMobileImageResources } from "../image-generation";
import { failure, objectSchema, ok, text, type HostTool } from "./tool";

export function latestUserImages(messages: readonly ChatSessionMessage[]): string[] {
  const message = [...messages].reverse().find(item => item.role === Role.User);
  return message && Array.isArray(message.content)
    ? message.content.flatMap(part => (part.type === "image" ? [part.image] : []))
    : [];
}

const optionSchema = {
  size: { type: "string", description: "仅按用户明确要求指定尺寸。" },
  quality: { type: "string", description: "仅按用户明确要求指定质量。" },
  output_format: { type: "string", enum: ["png", "jpeg", "webp"] },
  background: { type: "string", description: "仅按用户要求指定透明或不透明背景。" },
  n: { type: "integer", minimum: 1, maximum: 16, description: "用户要求的候选图数量，缺省不传。" },
};

export function createMobileImageTools(
  database: string,
  dependencies: {
    generate?: typeof generateMobileImageResources;
    readImages?: (context: AiToolExecutionContext) => Promise<string[]>;
  } = {}
): HostTool[] {
  return (["generate", "edit"] as const).map(mode => ({
    name: mode === "generate" ? "generate_image" : "edit_image",
    risk: "read",
    description:
      mode === "generate"
        ? "使用设置中选用的图片插件生成图片。prompt 必填，尺寸、质量、格式、背景与数量仅按用户明确要求传入。返回可继续编辑的图片地址。"
        : "使用图片插件编辑图片。image_paths 可传已生成的图片地址、本机应用资源路径、HTTP(S) URL 或 data:image base64；省略时使用当前这条用户消息附带的图片，不会取更早消息的图片。可指定 image_indices（从 1 开始）选取当前附件。",
    inputSchema: objectSchema(
      {
        prompt: { type: "string", minLength: 1, description: "图片生成或编辑要求。" },
        ...(mode === "edit"
          ? {
              image_paths: {
                type: "array",
                minItems: 1,
                maxItems: 16,
                items: { type: "string", minLength: 1 },
              },
              image_indices: {
                type: "array",
                minItems: 1,
                maxItems: 16,
                items: { type: "integer", minimum: 1 },
                description: "当前用户消息的图片编号，从 1 开始；不能与 image_paths 同时使用。",
              },
            }
          : {}),
        ...optionSchema,
      },
      ["prompt"]
    ),
    execute: async (input, context) => {
      const prompt = text(input, "prompt")?.trim();
      if (!prompt) return failure("INVALID_ARGUMENT", "prompt 不能为空");
      if (context.session.databaseName !== database)
        return failure("LIBRARY_CHANGED", "图片工具所属数据库已变化");
      context.signal.throwIfAborted();
      let imagePaths: string[] | undefined;
      if (mode === "edit") {
        if (input.image_paths !== undefined && input.image_indices !== undefined)
          return failure("INVALID_ARGUMENT", "image_paths 和 image_indices 不能同时传入");
        if (input.image_paths !== undefined) {
          if (
            !Array.isArray(input.image_paths) ||
            !input.image_paths.length ||
            input.image_paths.some(path => typeof path !== "string" || !path.trim())
          )
            return failure("INVALID_ARGUMENT", "image_paths 必须包含有效的图片地址");
          imagePaths = input.image_paths.map(path => (path as string).trim());
        } else {
          const attachments = (await dependencies.readImages?.(context)) ?? [];
          if (input.image_indices !== undefined) {
            if (
              !Array.isArray(input.image_indices) ||
              !input.image_indices.length ||
              input.image_indices.some(
                index => !Number.isInteger(index) || index < 1 || index > attachments.length
              )
            )
              return failure("INVALID_ARGUMENT", "图片编号超出当前消息附件范围");
            imagePaths = input.image_indices.map(index => attachments[index - 1]);
          } else imagePaths = attachments;
        }
        if (!imagePaths.length)
          return failure("IMAGE_REQUIRED", "请附带要编辑的图片，或提供已生成图片的地址");
      }
      const count = input.n;
      if (
        count !== undefined &&
        (typeof count !== "number" || !Number.isInteger(count) || count < 1 || count > 16)
      )
        return failure("INVALID_ARGUMENT", "n 必须是 1 到 16 的整数");
      const options: ImageOptions = {
        size: text(input, "size"),
        quality: text(input, "quality"),
        outputFormat: text(input, "output_format") as ImageOptions["outputFormat"],
        background: text(input, "background"),
        count: count as number | undefined,
      };
      context.signal.throwIfAborted();
      const images = await (dependencies.generate ?? generateMobileImageResources)({
        database,
        prompt,
        imagePaths,
        options,
        signal: context.signal,
      });
      const payload = { success: true, mode, prompt, images };
      return ok(payload, { render: { rendererKey: "openai-image-result", payload } });
    },
  }));
}
