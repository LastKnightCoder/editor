import { describe, expect, it } from "vitest";
import { buildGenerationRequest, type GenerationRequest } from "@/services/generation-orchestrator";
import type { RequestMessage } from "@/types/llm";
const getMessageText = (message: RequestMessage): string => {
  if (typeof message.content === "string") {
    return message.content;
  }

  const firstBlock = message.content[0];
  return firstBlock?.type === "text" ? firstBlock.text : "";
};

describe("services/generation-orchestrator", () => {
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

  it("plugin + vibe_learning 用插件的任务要求，通用规则、资料与检索工具由宿主补", () => {
    const request: GenerationRequest<"plugin", "vibe_learning"> = {
      taskType: "plugin",
      sourceType: "vibe_learning",
      taskPayload: {
        pluginId: "tau.podcast",
        title: "播客脚本",
        instructions: "写一段双人对话，每行「说话人: 内容」",
        reminders: ["不要输出标题"],
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
    expect(systemText).toContain("vibe_learning_query");
    expect(systemText).toContain("写一段双人对话");
    expect(userText).toContain("播客脚本");
    expect(userText).toContain("资料 X");
    expect(userText).toContain("强调案例");
    expect(userText).toContain("不要输出标题");
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

  it("演示生成与续改都将选择的模板交给分页工作区", () => {
    for (const taskType of ["ppt", "ppt_edit"] as const) {
      const result = buildGenerationRequest({
        taskType,
        sourceType: "vibe_learning",
        taskPayload: { template: "handwritten-v1" },
        sourcePayload: { resourceNames: ["课程资料"], userPrompt: "强调流程图" },
      });
      expect(result.enableTools).toBe(true);
      expect(getMessageText(result.messages[0])).toContain("handwritten-v1");
      expect(getMessageText(result.messages[1])).toContain("强调流程图");
    }
  });
  it("ppt + provided_content 应保持未接入专用入口", () => {
    const request: GenerationRequest<"ppt", "provided_content"> = {
      taskType: "ppt",
      sourceType: "provided_content",
      taskPayload: {
        template: "cinematic-v1",
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
