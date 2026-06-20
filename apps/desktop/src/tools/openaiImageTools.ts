import type { ToolDefinition, ToolParameterSchema } from "@/types";
import type {
  ImageGenerationStoreShape,
  ImageProviderConfig,
  ImageResult,
} from "@/types/imageGeneration";
import {
  createImageFileFromBase64,
  resolveImageInputFile,
  isProviderConfigValid,
  getActiveImageGenerationConfig,
  createProviderFromConfig,
} from "@/utils/image-generation";

export const OPENAI_IMAGE_TOOLS_SOURCE = "openai-image-tools";
export const OPENAI_IMAGE_RENDERER_KEY = "openai-image-result";
export const OPENAI_IMAGE_TOOL_NAMES = new Set([
  "generate_image",
  "edit_image",
]);

type ImageToolMode = "generate" | "edit";

interface UploadedImageResult {
  url: string;
  mimeType: string;
  fileName: string;
  revisedPrompt?: string;
}

interface ImageToolResultPayload {
  success: boolean;
  mode: ImageToolMode;
  prompt: string;
  images: UploadedImageResult[];
  parameters: Record<string, unknown>;
}

export interface ImageToolDependencies {
  getConfig?: () => ImageProviderConfig | null;
  uploadImage?: (file: File) => Promise<string | null>;
  resolveImageInputFile?: typeof resolveImageInputFile;
}

const optionSchema = {
  size: {
    type: "string",
    description:
      "单次图片尺寸。仅在用户明确要求横图、竖图、头像、封面等尺寸时传入，否则省略。",
  },
  quality: {
    type: "string",
    description: "单次图片质量。仅在用户明确要求高质量、草稿等质量偏好时传入。",
  },
  output_format: {
    type: "string",
    enum: ["png", "jpeg", "webp"],
    description: "输出格式。需要透明背景时通常选择 png；否则按用户需求决定。",
  },
  background: {
    type: "string",
    description: "背景模式。仅在用户明确要求透明背景或不透明背景时传入。",
  },
  n: {
    type: "number",
    description: "生成图片数量。仅在用户要求多张候选图时传入。",
  },
} satisfies Record<string, ToolParameterSchema>;

const uploadImageResource = async (file: File) => {
  const { uploadResource } = await import("@/hooks/useUploadResource");
  return uploadResource(file);
};

export const getImageToolsEnabled = (state?: ImageGenerationStoreShape) => {
  const config = state
    ? resolveImageGenerationSetting({ imageGeneration: state })
    : getActiveImageGenerationConfig();
  return isProviderConfigValid(config);
};

const pickOptions = (
  args: Record<string, unknown>,
): Record<string, unknown> => {
  const options: Record<string, unknown> = {};
  if (typeof args.size === "string" && args.size.trim()) {
    options.size = args.size.trim();
  }
  if (typeof args.quality === "string" && args.quality.trim()) {
    options.quality = args.quality.trim();
  }
  if (typeof args.output_format === "string" && args.output_format.trim()) {
    options.output_format = args.output_format.trim();
  }
  if (typeof args.background === "string" && args.background.trim()) {
    options.background = args.background.trim();
  }
  if (typeof args.n === "number" && Number.isFinite(args.n)) {
    options.n = args.n;
  }
  return options;
};

const getPrompt = (args: Record<string, unknown>) => {
  const prompt = typeof args.prompt === "string" ? args.prompt.trim() : "";
  if (!prompt) {
    throw new Error("prompt 不能为空");
  }
  return prompt;
};

const uploadImageResults = async (
  results: ImageResult[],
  uploadImage: (file: File) => Promise<string | null>,
  resolveInputFile: typeof resolveImageInputFile,
) => {
  const uploaded: UploadedImageResult[] = [];
  for (const [index, result] of results.entries()) {
    const file = result.b64Json
      ? createImageFileFromBase64(
          result.b64Json,
          result.mimeType ?? "image/png",
          `openai-image-${index + 1}`,
        )
      : result.url
        ? await resolveInputFile(result.url)
        : null;
    if (!file) {
      throw new Error("图片生成结果缺少 b64_json 和 url");
    }
    const url = await uploadImage(file);
    if (!url) {
      throw new Error("图片已生成，但 uploadResource 上传失败");
    }
    uploaded.push({
      url,
      mimeType: file.type,
      fileName: file.name,
      revisedPrompt: result.revisedPrompt,
    });
  }
  return uploaded;
};

const buildToolResult = (payload: ImageToolResultPayload) => ({
  content: JSON.stringify(payload, null, 2),
  metadata: {
    render: {
      rendererKey: OPENAI_IMAGE_RENDERER_KEY,
      payload,
    },
  },
});

export const createImageToolDefinitions = (
  dependencies: ImageToolDependencies = {},
): ToolDefinition[] => {
  const getConfig = dependencies.getConfig ?? getActiveImageGenerationConfig;
  const uploadImage = dependencies.uploadImage ?? uploadImageResource;
  const resolveInputFile =
    dependencies.resolveImageInputFile ?? resolveImageInputFile;

  return [
    {
      name: "generate_image",
      description:
        "使用已配置的图片生成模型生成图片。prompt 必填；size、quality、output_format、background、n 均为单次可选参数，只有用户明确提出尺寸、质量、格式、透明背景或多张候选图需求时才传入，否则省略。",
      parameters: {
        type: "object",
        properties: {
          prompt: {
            type: "string",
            description: "图片生成提示词，描述主体、风格、构图、用途等。",
          },
          ...optionSchema,
        },
        required: ["prompt"],
        additionalProperties: false,
      },
      executor: async (args, context) => {
        const config = getConfig();
        if (!config || !isProviderConfigValid(config)) {
          return {
            content:
              "图片生成配置无效，请先在设置中填写模型地址、API Key 和模型名称，并在 MCP 管理中心启用图片生成工具。",
            isParameterError: true,
          };
        }
        const prompt = getPrompt(args);
        const parameters = pickOptions(args);
        const provider = createProviderFromConfig(config);
        const results = await provider.generate({
          config,
          prompt,
          options: parameters,
          signal: context?.signal,
        });
        const images = await uploadImageResults(
          results,
          uploadImage,
          resolveInputFile,
        );
        return buildToolResult({
          success: true,
          mode: "generate",
          prompt,
          images,
          parameters,
        });
      },
    },
    {
      name: "edit_image",
      description:
        "使用已配置的图片生成模型编辑图片。prompt 和 image_paths 必填；image_paths 可传本地路径、file://、~、相对路径、远程 URL 或 data URL。size、quality、output_format、background、n 是单次可选参数，仅按用户本次需求传入。",
      parameters: {
        type: "object",
        properties: {
          prompt: {
            type: "string",
            description: "图片编辑指令，说明要保留、修改、替换或生成的内容。",
          },
          image_paths: {
            type: "array",
            description:
              "待编辑图片列表，支持本地路径、file://、~、相对路径、远程 URL 或 data:image base64。",
            items: { type: "string" },
          },
          ...optionSchema,
        },
        required: ["prompt", "image_paths"],
        additionalProperties: false,
      },
      executor: async (args, context) => {
        const config = getConfig();
        if (!config || !isProviderConfigValid(config)) {
          return {
            content:
              "图片生成配置无效，请先在设置中填写模型地址、API Key 和模型名称，并在 MCP 管理中心启用图片生成工具。",
            isParameterError: true,
          };
        }
        const prompt = getPrompt(args);
        const imagePaths = Array.isArray(args.image_paths)
          ? args.image_paths.filter(
              (item): item is string => typeof item === "string",
            )
          : [];
        if (imagePaths.length === 0) {
          throw new Error("image_paths 至少需要包含一张图片");
        }
        const parameters = pickOptions(args);
        const imageFiles = await Promise.all(
          imagePaths.map((path) => resolveInputFile(path)),
        );
        const provider = createProviderFromConfig(config);
        const results = await provider.edit({
          config,
          prompt,
          imageFiles,
          options: parameters,
          signal: context?.signal,
        });
        const images = await uploadImageResults(
          results,
          uploadImage,
          resolveInputFile,
        );
        return buildToolResult({
          success: true,
          mode: "edit",
          prompt,
          images,
          parameters,
        });
      },
    },
  ];
};

export const resolveImageGenerationSetting = (setting: {
  imageGeneration: ImageGenerationStoreShape;
}): ImageProviderConfig | null => {
  const { currentProviderId, providers } = setting.imageGeneration;
  return providers.find((p) => p.id === currentProviderId) ?? null;
};
