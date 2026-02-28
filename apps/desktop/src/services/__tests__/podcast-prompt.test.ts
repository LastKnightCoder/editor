import { describe, expect, it, vi } from "vitest";
import { buildPodcastPrompt } from "@/services/podcast";
import { SpeakerRole } from "@/types/podcast";
import { ETTSProvider } from "@/types/tts";

vi.mock("@/hooks/useChatLLM", () => ({
  chatLLMStream: vi.fn(),
}));

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
        provider: ETTSProvider.Minimax,
        minimaxModel: "speech-2.8-hd",
      },
      3,
      5,
    );

    expect(prompt).toContain(
      "Emotion tags are allowed only from this whitelist",
    );
    expect(prompt).toContain("(laughs)");
    expect(prompt).toContain("<#x#>");
  });

  it("speech-2.6 应注入禁止语气标签规则", () => {
    const prompt = buildPodcastPrompt(
      "测试内容",
      speakers,
      {
        provider: ETTSProvider.Minimax,
        minimaxModel: "speech-2.6-hd",
      },
      3,
      5,
    );

    expect(prompt).toContain("Pause tags are allowed");
    expect(prompt).toContain("Do not output any parenthesized emotion tags.");
  });

  it("非 Minimax 应注入禁止停顿与语气标签规则", () => {
    const prompt = buildPodcastPrompt(
      "测试内容",
      speakers,
      {
        provider: ETTSProvider.Doubao,
        minimaxModel: "speech-2.8-hd",
      },
      3,
      5,
    );

    expect(prompt).toContain("Do not output pause tags like <#1.2#>.");
    expect(prompt).toContain("Do not output any parenthesized emotion tags.");
  });
});
