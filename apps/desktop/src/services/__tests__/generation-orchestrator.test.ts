import { beforeEach, describe, expect, it, vi } from "vitest";

const mockImageToolsEnabled = vi.hoisted(() => ({ value: true }));

vi.mock("@/tools", () => ({
  default: {
    hasEnabledTool: vi.fn((toolName: string) => {
      if (toolName !== "generate_image") {
        return false;
      }
      return mockImageToolsEnabled.value;
    }),
  },
  ensureToolingReady: vi.fn(),
}));
import { buildGenerationRequest, type GenerationRequest } from "@/services/generation-orchestrator";
import type { RequestMessage } from "@/types/llm";
import { SpeakerRole } from "@/types/podcast";
import useSettingStore from "@/stores/useSettingStore";
import useMCPStore from "@/stores/useMCPStore";

const createPPTRequest = (): GenerationRequest<"ppt", "vibe_learning"> => ({
  taskType: "ppt",
  sourceType: "vibe_learning",
  taskPayload: {
    template: {
      id: "test-template",
      name: "测试模板",
      description: "用于测试",
      previewHtml: "",
      fullTemplate: "",
      styleGuide: "",
    },
  },
  sourcePayload: {
    resourceNames: ["课程资料"],
    userPrompt: "强调流程图",
  },
});

const configureImageTools = (enabled: boolean) => {
  mockImageToolsEnabled.value = enabled;
  useSettingStore.setState(state => ({
    setting: {
      ...state.setting,
      imageGeneration: {
        currentProviderId: "default",
        providers: [
          {
            id: "default",
            name: "test",
            pluginId: "test.images",
            config: { region: "a" },
            modelId: "model",
          },
        ],
      },
    },
  }));
  useMCPStore.getState().setProviderEnabled("openai-image-tools", enabled);
};

const getMessageText = (message: RequestMessage): string => {
  if (typeof message.content === "string") {
    return message.content;
  }

  const firstBlock = message.content[0];
  return firstBlock?.type === "text" ? firstBlock.text : "";
};

describe("services/generation-orchestrator", () => {
  beforeEach(() => {
    configureImageTools(true);
  });
  it("outline + vibe_learning 应启用工具并注入探索规则", () => {
    const request: GenerationRequest<"outline", "vibe_learning"> = {
      taskType: "outline",
      sourceType: "vibe_learning",
      taskPayload: {},
      sourcePayload: {
        resourceNames: ["资料 A", "资料 B"],
        userPrompt: "按章节输出",
      },
    };

    const result = buildGenerationRequest(request);
    const systemText = getMessageText(result.messages[0]);
    const userText = getMessageText(result.messages[1]);

    expect(result.enableTools).toBe(true);
    expect(systemText).toContain("资料探索规则");
    expect(userText).toContain("资料 A");
    expect(userText).toContain("按章节输出");
  });

  it("quiz + provided_content 应关闭工具并注入已提供内容规则", () => {
    const request: GenerationRequest<"quiz", "provided_content"> = {
      taskType: "quiz",
      sourceType: "provided_content",
      taskPayload: {},
      sourcePayload: {
        content: "这是测试内容",
        userPrompt: "生成 5 题",
      },
    };

    const result = buildGenerationRequest(request);
    const systemText = getMessageText(result.messages[0]);
    const userText = getMessageText(result.messages[1]);

    expect(result.enableTools).toBe(false);
    expect(systemText).toContain("已提供内容使用规则");
    expect(userText).toContain("这是测试内容");
    expect(userText).toContain("生成 5 题");
  });

  it("podcast + vibe_learning 应构建工具探索式播客请求", () => {
    const request: GenerationRequest<"podcast", "vibe_learning"> = {
      taskType: "podcast",
      sourceType: "vibe_learning",
      taskPayload: {
        speakers: [
          {
            name: "主持人A",
            voiceId: "v1",
            voiceName: "v1",
            role: SpeakerRole.Host,
          },
          {
            name: "嘉宾B",
            voiceId: "v2",
            voiceName: "v2",
            role: SpeakerRole.Guest,
          },
        ],
        ttsPromptOptions: {
          textInstructions: "插件文本规则：允许 (laughs) 与 <#x#>",
        },
        durationMin: 4,
        durationMax: 6,
      },
      sourcePayload: {
        resourceNames: ["资料 X"],
        userPrompt: "强调案例",
      },
    };

    const result = buildGenerationRequest(request);
    const systemText = getMessageText(result.messages[0]);
    const userText = getMessageText(result.messages[1]);

    expect(result.enableTools).toBe(true);
    expect(systemText).toContain("先主动探索资料");
    expect(systemText).toContain("主持人A");
    expect(userText).toContain("资料 X");
    expect(userText).toContain("强调案例");
  });

  it("article + vibe_learning 应注入文章质量要求与风格", () => {
    const request: GenerationRequest<"article", "vibe_learning"> = {
      taskType: "article",
      sourceType: "vibe_learning",
      taskPayload: {
        style: "technical",
      },
      sourcePayload: {
        resourceNames: ["资料 Y"],
        userPrompt: "结合真实场景",
      },
    };

    const result = buildGenerationRequest(request);
    const systemText = getMessageText(result.messages[0]);
    const userText = getMessageText(result.messages[1]);

    expect(result.enableTools).toBe(true);
    expect(systemText).toContain("可直接阅读的长文章");
    expect(systemText).toContain("参考来源隐形");
    expect(systemText).toContain("不要让前文出现后文才解释的关键概念");
    expect(systemText).toContain("不要提到资料、材料、原文、视频、课程、文档");
    expect(userText).toContain("资料 Y");
    expect(userText).toContain("技术文档");
    expect(userText).toContain("不要输出任何前置说明");
    expect(userText).toContain("结合真实场景");
  });

  it("ppt + vibe_learning 在图片工具启用时注入 AI 插图规则", () => {
    const request = createPPTRequest();

    const result = buildGenerationRequest(request);
    const systemText = getMessageText(result.messages[0]);
    const userText = getMessageText(result.messages[1]);

    expect(result.enableTools).toBe(true);
    expect(systemText).toContain("generate_image");
    expect(systemText).toContain("images[0].url");
    expect(systemText).toContain("read_image");
    expect(systemText).toContain("不要伪造 URL");
    expect(systemText).toContain("降级为无图片版 slide");
    expect(systemText).toContain("每个适合配图的重点页面最多 1 张");
    expect(userText).toContain("课程资料");
    expect(userText).toContain("强调流程图");
  });

  it("ppt + vibe_learning 在图片工具未启用时不注入 AI 插图规则", () => {
    configureImageTools(false);

    const result = buildGenerationRequest(createPPTRequest());
    const systemText = getMessageText(result.messages[0]);

    expect(result.enableTools).toBe(true);
    expect(systemText).not.toContain("generate_image");
    expect(systemText).not.toContain("images[0].url");
    expect(systemText).not.toContain("AI 插图使用规则");
  });

  it("ppt + provided_content 应保持未接入专用入口", () => {
    const request: GenerationRequest<"ppt", "provided_content"> = {
      taskType: "ppt",
      sourceType: "provided_content",
      taskPayload: {
        template: {
          id: "test-template",
          name: "测试模板",
          description: "用于测试",
          previewHtml: "",
          fullTemplate: "",
          styleGuide: "",
        },
      },
      sourcePayload: {
        content: "这是用于生成 PPT 的内容",
        userPrompt: "做成教学课件",
      },
    };

    expect(() => buildGenerationRequest(request)).toThrow(
      "任务 ppt 当前未接入 provided_content 数据源"
    );
  });
});
