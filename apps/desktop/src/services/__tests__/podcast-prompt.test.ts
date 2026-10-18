import { describe, expect, it } from "vitest";
import {
  buildPodcastPrompt,
  buildPodcastToolsSystemPrompt,
  buildPodcastToolsUserPrompt,
} from "@/services/podcast";
import { SpeakerRole } from "@/types/podcast";
import { buildMinimaxSpeechPromptRules } from "@/utils/tts/minimaxSpeech";

describe("services/podcast buildPodcastPrompt", () => {
  const speakers = [
    { name: "主持人A", voiceId: "v1", voiceName: "v1", role: SpeakerRole.Host },
    { name: "嘉宾B", voiceId: "v2", voiceName: "v2", role: SpeakerRole.Guest },
  ];

  it("speech-2.8 应注入允许英文语气标签规则", () => {
    const prompt = buildPodcastPrompt(
      "测试内容",
      speakers,
      {
        textInstructions: buildMinimaxSpeechPromptRules(true, "speech-2.8-hd"),
      },
      3,
      5
    );

    expect(prompt).toContain("Emotion tags are allowed only from this whitelist");
    expect(prompt).toContain("(laughs)");
    expect(prompt).toContain("<#x#>");
  });

  it("speech-2.6 应注入禁止语气标签规则", () => {
    const prompt = buildPodcastPrompt(
      "测试内容",
      speakers,
      {
        textInstructions: buildMinimaxSpeechPromptRules(true, "speech-2.6-hd"),
      },
      3,
      5
    );

    expect(prompt).toContain("Pause tags are allowed");
    expect(prompt).toContain("Do not output any parenthesized emotion tags.");
    expect(prompt).toContain("严格基于已提供内容");
    expect(prompt).toContain("不要自行脑补该细节");
  });

  it("工具模式应强调先探索再生成", () => {
    const systemPrompt = buildPodcastToolsSystemPrompt(
      speakers,
      {
        textInstructions: buildMinimaxSpeechPromptRules(true, "speech-2.8-hd"),
      },
      4,
      6
    );
    const userPrompt = buildPodcastToolsUserPrompt(["资料 A", "资料 B"], "重点讲案例", 4, 6);

    expect(systemPrompt).toContain("资料探索规则");
    expect(systemPrompt).toContain("先主动探索资料");
    expect(systemPrompt).toContain("不要只围绕零散片段生成");
    expect(userPrompt).toContain("资料 A");
    expect(userPrompt).toContain("重点讲案例");
    expect(userPrompt).toContain("直接输出纯对话文本");
  });
});
