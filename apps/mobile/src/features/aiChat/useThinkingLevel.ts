// 对话的思考强度：可选档位按当前模型真实能力给出，选择记在本机、所有对话共用（与桌面一致）。
// 没选过时显示模型设置里的默认档；换到不支持该档的模型时落到可选集合内，显示与实际发送一致。

import { useMemo, useState } from "react";
import { thinkingLevelsOf, type LLMUsageConfigV2 } from "@tau/ai/models";
import { clampThinkingLevel, isThinkingLevel, type ThinkingLevel } from "@tau/shared/chat-core";
import type { MobileLlmProvider } from "../../types";

const STORAGE_KEY = "tau-mobile-chat-thinking-level";

function readStored(): ThinkingLevel | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return isThinkingLevel(stored) ? stored : null;
  } catch {
    return null;
  }
}

export function useThinkingLevel(
  providers: readonly MobileLlmProvider[],
  model: LLMUsageConfigV2 | null,
  modelDefault: ThinkingLevel | undefined
) {
  const [stored, setStored] = useState(readStored);
  const options = useMemo(
    () => (model ? thinkingLevelsOf(providers, model) : []),
    [providers, model]
  );
  const level = clampThinkingLevel(stored ?? modelDefault ?? "off", options);
  const pick = (next: ThinkingLevel) => {
    setStored(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // 存不下只影响下次进入的默认值
    }
  };
  // 只有一个档位（不支持推理或不能关闭思考的单档模型）时不给选择
  const selectable = options.length > 1;
  return { level: selectable ? level : undefined, options, selectable, pick };
}
