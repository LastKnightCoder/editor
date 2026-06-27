/**
 * 播客生成通用服务
 * 包含脚本生成、解析等与 TTS 提供商无关的通用方法
 */

import type { PodcastSpeaker, PodcastScriptLine } from "@/types/podcast";
import type { ProviderConfig, ModelConfig, RequestMessage } from "@/types/llm";
import type { MinimaxSpeechModel } from "@/types/minimax";
import { ETTSProvider } from "@/types/tts";
import { Role } from "@/constants";
import { chatLLMStream } from "@/hooks/useChatLLM";
import {
  buildVibeLearningGenerationUserPrompt,
  VIBE_LEARNING_GENERATION_RULES,
} from "@/constants/prompts/vibe-learning-generation";
import {
  buildProvidedContentGenerationUserPrompt,
  PROVIDED_CONTENT_GENERATION_RULES,
} from "@/constants/prompts/provided-content-generation";
import { buildMinimaxSpeechPromptRules } from "@/utils/tts/minimaxSpeech";

export interface PodcastTTSPromptOptions {
  provider: ETTSProvider;
  minimaxModel: MinimaxSpeechModel;
}

interface PodcastScriptSourceOptions {
  content?: string;
  resourceNames?: string[];
  userPrompt?: string;
  enableTools?: boolean;
}

/**
 * 生成播客脚本（流式）
 * 通过 LLM 生成播客对话脚本
 */
export function generateScriptStream(
  source: PodcastScriptSourceOptions,
  speakers: PodcastSpeaker[],
  providerConfig: ProviderConfig,
  modelConfig: ModelConfig,
  onUpdate: (chunk: string) => void,
  onFinish: () => void,
  onError: (error: Error) => void,
  ttsPromptOptions: PodcastTTSPromptOptions,
  durationMin?: number,
  durationMax?: number,
): void {
  const messages = buildPodcastMessages(
    source,
    speakers,
    ttsPromptOptions,
    durationMin,
    durationMax,
  );

  chatLLMStream(providerConfig, modelConfig, messages, {
    enableTools: source.enableTools,
    onUpdate: (_responseText: string, fetchText: string) => {
      // 只发送新增的内容
      onUpdate(fetchText);
    },
    onFinish: () => {
      onFinish();
    },
    onError: (error: Error) => {
      onError(error);
    },
  });
}

/**
 * 解析播客脚本
 * 将文本脚本解析为结构化的脚本行
 */
export function parseScript(
  script: string,
  speakers: PodcastSpeaker[],
): PodcastScriptLine[] {
  const lines = script.split("\n").filter((line) => line.trim());
  const scriptLines: PodcastScriptLine[] = [];
  const speakerNames = new Set(speakers.map((s) => s.name));
  const missedSpeakers = new Set<string>();

  for (const line of lines) {
    // 匹配 "SpeakerName: 文本" 格式
    const match = line.match(/^([^:：]+)[：:]\s*(.+)$/);
    if (!match) continue;

    const speakerName = match[1].trim();
    const text = match[2].trim();

    // 查找对应的 speaker 配置
    const speaker = speakers.find((s) => s.name === speakerName);
    if (!speaker) {
      missedSpeakers.add(speakerName);
      continue;
    }

    // 检查是否与上一个说话人相同，如果相同则合并文本
    const lastLine = scriptLines[scriptLines.length - 1];
    if (lastLine && lastLine.speaker === speakerName) {
      lastLine.text += " " + text;
    } else {
      scriptLines.push({
        speaker: speakerName,
        text,
        voiceId: speaker.voiceId,
        startTime: 0,
        duration: 0,
      });
    }
  }

  if (missedSpeakers.size > 0) {
    console.warn(
      `脚本解析：未匹配的说话人 [${[...missedSpeakers].join(", ")}]，已有说话人 [${[...speakerNames].join(", ")}]`,
    );
  }

  return scriptLines;
}

function buildPodcastMessages(
  source: PodcastScriptSourceOptions,
  speakers: PodcastSpeaker[],
  ttsPromptOptions: PodcastTTSPromptOptions,
  durationMin = 3,
  durationMax = 5,
): RequestMessage[] {
  if (source.enableTools) {
    const resourceNames = source.resourceNames || [];
    return [
      {
        role: Role.System,
        content: [
          {
            type: "text",
            text: buildPodcastToolsSystemPrompt(
              speakers,
              ttsPromptOptions,
              durationMin,
              durationMax,
            ),
          },
        ],
      },
      {
        role: Role.User,
        content: [
          {
            type: "text",
            text: buildPodcastToolsUserPrompt(
              resourceNames,
              source.userPrompt,
              durationMin,
              durationMax,
            ),
          },
        ],
      },
    ];
  }

  return [
    {
      role: Role.User,
      content: [
        {
          type: "text",
          text: buildPodcastPrompt(
            source.content || "",
            speakers,
            ttsPromptOptions,
            durationMin,
            durationMax,
          ),
        },
      ],
    },
  ];
}

/**
 * 构建播客脚本生成的 Prompt
 */
export function buildPodcastPrompt(
  content: string,
  speakers: PodcastSpeaker[],
  ttsPromptOptions: PodcastTTSPromptOptions,
  durationMin = 3,
  durationMax = 5,
): string {
  return `${buildPodcastProvidedContentSystemPrompt(
    speakers,
    ttsPromptOptions,
    durationMin,
    durationMax,
  )}

${buildPodcastProvidedContentUserPrompt(content, undefined, durationMin, durationMax)}`;
}

export function buildPodcastProvidedContentSystemPrompt(
  speakers: PodcastSpeaker[],
  ttsPromptOptions: PodcastTTSPromptOptions,
  durationMin = 3,
  durationMax = 5,
): string {
  const speakerList = speakers.map((s) => `${s.name}（${s.role}）`).join("、");

  const speakerInstructions = speakers
    .map((s) => {
      if (s.role === "主持人") {
        return `  - ${s.name}（主持人）：负责引导讨论、提出问题、掌控节奏、引出嘉宾观点`;
      }
      return `  - ${s.name}（嘉宾）：分享专业见解、深入分析、提供案例、回应主持人问题，富有幽默感`;
    })
    .join("\n");

  const conversationTips =
    speakers.length > 2
      ? "注意平衡各个说话人的发言机会，确保每个人都有充分表达的空间。主持人要引导轮流发言，避免某个嘉宾独占话语权"
      : "主持人和嘉宾要有来有往，形成自然的对话节奏。主持人提问要精准，嘉宾回答要充分详细";

  const lengthGuidance = `为了减少合成请求次数，每次发言应该较长且完整（建议每次发言 50-150 字），避免过于简短的对话。每次发言要包含完整的观点表达，可以包含多个句子`;
  const ttsTagRules = buildMinimaxSpeechPromptRules(
    ttsPromptOptions.provider === ETTSProvider.Minimax,
    ttsPromptOptions.minimaxModel,
  );

  return `你是一个专业的播客脚本编写助手。请基于已经提供的内容生成一段 ${durationMin}-${durationMax} 分钟的${speakers.length}人播客对话脚本。

${PROVIDED_CONTENT_GENERATION_RULES}

播客节目信息：
- 参与者：${speakerList}
- 目标时长：${durationMin}-${durationMax} 分钟

要求：

1. **对话风格**：自然流畅，真实生动，富有互动性和深度，表达尽量口语化，文本富有情绪化，比如惊讶，惊喜，担心，兴奋，愤怒，悲伤，喜悦，等等
2. **说话人角色**：
${speakerInstructions}
3. **对话长度**：${lengthGuidance}
4. **格式要求**：每句话单独一行，格式严格为 "${speakers[0].name}: 内容"
5. **互动性**：${conversationTips}，不需要互相打招呼问好，但是需要和观众介绍自己
6. **内容结构**：
   - 开场：主持人简短介绍主题和嘉宾（1-2 轮）
   - 主体：深入讨论已提供内容中的核心内容（占 80%）
     * 主持人提问 → 嘉宾详细回答
     * 嘉宾回答要充分展开，包含观点、分析、例证
     * 适时追问，挖掘深层次内容
   - 结尾：总结要点和启发（1-2 轮）
7. **内容要求**：
   - 严格基于已提供内容，不偏离主题，不要补充内容中没有依据的事实
   - 嘉宾发言要有深度，体现专业性
   - 包含适当的语气词（"嗯"、"啊"、"其实"、"你看"等）使对话自然
   - 可以有适度的重复和强调
   - 如果已提供内容没有覆盖某个细节，就不要自行脑补该细节
8. **TTS 标签规则**：
${ttsTagRules}
9. **绝对禁止**：
   - 不要有任何动作描述，如（笑）（停顿）（点头）
   - 不要有心理活动描述，如（思考）（沉默）
   - 不要有场景描述，如（翻看资料）（喝水）
   - 只输出纯对话文本`;
}

export function buildPodcastProvidedContentUserPrompt(
  content: string,
  userPrompt?: string,
  durationMin = 3,
  durationMax = 5,
): string {
  return buildProvidedContentGenerationUserPrompt({
    title: `播客脚本生成（${durationMin}-${durationMax} 分钟）`,
    content,
    userPrompt,
    extraReminders: [
      "播客脚本必须严格基于已提供内容，不要补充已提供内容中没有依据的事实",
      "用户不知道源内容的存在，不要在脚本中提及“材料”“原文”“文中”“上文”等表述",
    ],
    finalOutput: [
      "直接输出纯对话文本",
      "每行必须严格使用“说话人: 内容”格式",
      "不要输出标题、说明、代码块或任何额外文字",
      "每次发言要较长且完整（50-100 字），不要把同一人的一段话拆成多行连续发言",
      "严格遵守 TTS 标签规则，不要输出未允许的括号标签",
    ],
  });
}

export function buildPodcastToolsSystemPrompt(
  speakers: PodcastSpeaker[],
  ttsPromptOptions: PodcastTTSPromptOptions,
  durationMin = 3,
  durationMax = 5,
): string {
  const speakerList = speakers.map((s) => `${s.name}（${s.role}）`).join("、");
  const speakerInstructions = speakers
    .map((s) => {
      if (s.role === "主持人") {
        return `  - ${s.name}（主持人）：负责引导讨论、提出问题、掌控节奏、引出嘉宾观点`;
      }
      return `  - ${s.name}（嘉宾）：分享专业见解、深入分析、提供案例、回应主持人问题，富有幽默感`;
    })
    .join("\n");
  const conversationTips =
    speakers.length > 2
      ? "注意平衡各个说话人的发言机会，确保每个人都有充分表达的空间。主持人要引导轮流发言，避免某个嘉宾独占话语权"
      : "主持人和嘉宾要有来有往，形成自然的对话节奏。主持人提问要精准，嘉宾回答要充分详细";
  const lengthGuidance =
    "为了减少合成请求次数，每次发言应该较长且完整（建议每次发言 50-150 字），避免过于简短的对话。每次发言要包含完整的观点表达，可以包含多个句子";
  const ttsTagRules = buildMinimaxSpeechPromptRules(
    ttsPromptOptions.provider === ETTSProvider.Minimax,
    ttsPromptOptions.minimaxModel,
  );

  return `你是一个专业的播客脚本编写助手。你需要先主动探索资料，再基于确认过的资料证据生成一段 ${durationMin}-${durationMax} 分钟的${speakers.length}人播客对话脚本。

${VIBE_LEARNING_GENERATION_RULES}

## 播客节目信息
- 参与者：${speakerList}
- 目标时长：${durationMin}-${durationMax} 分钟

## 生成要求
1. **对话风格**：自然流畅，真实生动，富有互动性和深度，表达尽量口语化，文本富有情绪化，比如惊讶，惊喜，担心，兴奋，愤怒，悲伤，喜悦，等等
2. **说话人角色**：
${speakerInstructions}
3. **对话长度**：${lengthGuidance}
4. **格式要求**：每句话单独一行，格式严格为 "${speakers[0].name}: 内容"
5. **互动性**：${conversationTips}，不需要互相打招呼问好，但是需要和观众介绍自己
6. **内容结构**：
   - 开场：主持人简短介绍主题和嘉宾（1-2 轮）
   - 主体：深入讨论资料中的核心内容（占 80%）
     * 主持人提问 -> 嘉宾详细回答
     * 嘉宾回答要充分展开，包含观点、分析、例证
     * 适时追问，挖掘深层次内容
   - 结尾：总结要点和启发（1-2 轮）
7. **内容约束**：
   - 搜索命中只能用于定位，关键事实、定义、步骤、案例都要回到原文范围确认
   - 如果资料是长文档，先 search/grep 定位，再按行或字符范围补读关键上下文
   - 不要只围绕零散片段生成，脚本应尽量覆盖资料中的主要模块
   - 用户不知道资料的存在，也不知道资料的内容，不要在脚本中提及或引用“原文”“资料”“文中”
8. **TTS 标签规则**：
${ttsTagRules}
9. **绝对禁止**：
   - 不要有任何动作描述，如（笑）（停顿）（点头）
   - 不要有心理活动描述，如（思考）（沉默）
   - 不要有场景描述，如（翻看资料）（喝水）
   - 不要输出任何解释、标题、前言、代码块，只输出纯对话文本

## 输出要求
1. 先完成资料探索，再开始写脚本
2. 最终直接输出纯对话文本
3. 每行只包含一条发言，格式必须是“说话人: 内容”
4. 不要输出与脚本无关的任何内容`;
}

export function buildPodcastToolsUserPrompt(
  resourceNames: string[],
  userPrompt?: string,
  durationMin = 3,
  durationMax = 5,
): string {
  return buildVibeLearningGenerationUserPrompt({
    title: `播客脚本生成（${durationMin}-${durationMax} 分钟）`,
    resourceNames,
    userPrompt,
    extraReminders: [
      "播客脚本要基于已确认的正文证据，不要仅凭摘要或搜索片段展开",
      "优先覆盖资料中的主要模块，再组织成自然的对话结构",
      "如果关键信息仍不完整，继续探索，不要提前开始写脚本",
    ],
    finalOutput: [
      "获取足够信息后，直接输出纯对话文本",
      "每行必须严格使用“说话人: 内容”格式",
      "不要输出标题、说明、代码块或任何额外文字",
      "不要提及“原文”“资料”“文中”“上述内容”等引用性表述",
    ],
  });
}
