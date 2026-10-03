/**
 * 评估脚本共用：按 setting.json 的功能槽在测试进程里直接调模型（不经 Electron），并累计 token 用量。
 * 只给 *.eval.test.ts 用；调用方测试文件头要声明 `// @vitest-environment node`（jsdom 的 AbortSignal 会让 fetch 失败）。
 */

import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { normalizeContext } from "@earendil-works/pi-ai";
import type { PiSingleShotRequest } from "@/types/pi-llm";
import { resolveUsageSlot, type LlmRef } from "../llm-usage-slot";
import {
  buildSingleShotContext,
  createProviderRegistry,
  resolveV2Providers,
} from "../pi-ai-runtime-core";

export interface EvalCompleter {
  slot: LlmRef;
  /** 实际用到的槽（主槽没配时回退到备用槽） */
  slotName: string;
  usage: { input: number; output: number; calls: number };
  complete(
    request: Omit<PiSingleShotRequest, "requestId">
  ): Promise<{ ok: boolean; text: string; error?: string }>;
}

/** 依次尝试 slots，取第一个配了模型的；都没配返回 null */
export async function createEvalCompleter(
  slots: string[],
  settingPath = process.env.KL_SETTING ?? join(homedir(), ".editor", "setting.json")
): Promise<EvalCompleter | null> {
  const setting = JSON.parse(readFileSync(settingPath, "utf8"));
  const slotName = slots.find(name => resolveUsageSlot(setting, name));
  if (!slotName) return null;
  const slot = resolveUsageSlot(setting, slotName)!;
  const registry = createProviderRegistry();
  await registry.syncProviders(resolveV2Providers(setting));
  const model = registry.resolveModel(slot.providerId, slot.modelId);
  if (!model) throw new Error(`模型未注册：${slot.providerId}/${slot.modelId}`);
  const usage = { input: 0, output: 0, calls: 0 };
  return {
    slot,
    slotName,
    usage,
    async complete(request) {
      const context = buildSingleShotContext(
        { ...request, requestId: "", providerId: slot.providerId, modelId: slot.modelId },
        slot.providerId,
        slot.modelId
      );
      let message = null as null | {
        content: Array<{ type: string; text?: string }>;
        usage?: { input: number; output: number };
      };
      let error = "";
      try {
        for await (const event of registry.models.streamSimple(
          model,
          normalizeContext(context),
          {}
        )) {
          if (event.type === "done") message = event.message as never;
          if (event.type === "error") error = event.error.errorMessage ?? "模型请求失败";
        }
      } catch (caught) {
        error = caught instanceof Error ? caught.message : String(caught);
      }
      usage.calls++;
      usage.input += message?.usage?.input ?? 0;
      usage.output += message?.usage?.output ?? 0;
      const text =
        message?.content
          .filter(block => block.type === "text")
          .map(block => block.text)
          .join("\n\n") ?? "";
      return error ? { ok: false, text: "", error } : { ok: true, text };
    },
  };
}
