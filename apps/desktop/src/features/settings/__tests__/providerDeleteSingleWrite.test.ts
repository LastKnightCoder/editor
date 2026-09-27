/**
 * 服务商/模型删除必须「一次操作一次写入」（事故修复）：
 * 旧实现先清分配槽位、再删服务商，两次 store 写入会广播出「槽位已清、服务商还在」的中间态；
 * 多窗口互相回灌时旧快照可能盖回新状态，表现为删掉的服务商又冒出来、并反复闪现。
 * 这里直接覆盖两者一起改的归约语义。
 */
import { describe, expect, it } from "vitest";
import { produce } from "immer";
import type { LLMProviderSetting, LLMUsageConfigV2 } from "@/types/pi-llm";

type Slots = Record<string, LLMUsageConfigV2 | null>;

const provider = (id: string, models: string[]): LLMProviderSetting => ({
  id,
  name: id,
  baseUrl: "https://api.example.com/v1",
  apiKey: "",
  api: "openai-completions",
  models: models.map(modelId => ({ id: modelId, reasoning: false, input: ["text"] as const })),
});

/** 与 LLMSection.confirmProviderDelete 同一套归约 */
const deleteProvider = (state: { providers: LLMProviderSetting[]; slots: Slots }, id: string) =>
  produce(state, draft => {
    const index = draft.providers.findIndex(p => p.id === id);
    if (index !== -1) draft.providers.splice(index, 1);
    for (const [key, usage] of Object.entries(draft.slots)) {
      if (usage?.providerId === id) draft.slots[key] = null;
    }
  });

/** 与 LLMSection.confirmModelDelete 同一套归约 */
const deleteModel = (
  state: { providers: LLMProviderSetting[]; slots: Slots },
  providerId: string,
  modelId: string
) =>
  produce(state, draft => {
    const target = draft.providers.find(p => p.id === providerId);
    if (target) target.models = target.models.filter(model => model.id !== modelId);
    for (const [key, usage] of Object.entries(draft.slots)) {
      if (usage?.providerId === providerId && usage.modelId === modelId) draft.slots[key] = null;
    }
  });

describe("删除服务商/模型的单次写入归约", () => {
  const base = () => ({
    providers: [provider("p1", ["m1", "m2"]), provider("p2", ["m3"])],
    slots: {
      chat: { providerId: "p1", modelId: "m1" },
      titleSummary: { providerId: "p1", modelId: "m2" },
      webClip: { providerId: "p2", modelId: "m3" },
      videoSummary: null,
    } as Slots,
  });

  it("删服务商：同一次写入里既移除服务商，也清掉它的全部分配（不留中间态、不留悬空引用）", () => {
    const next = deleteProvider(base(), "p1");
    expect(next.providers.map(p => p.id)).toEqual(["p2"]);
    expect(next.slots.chat).toBeNull();
    expect(next.slots.titleSummary).toBeNull();
    // 别家服务商的分配不受影响
    expect(next.slots.webClip).toEqual({ providerId: "p2", modelId: "m3" });
  });

  it("删服务商的结果是终态：再次归约不会让它复活", () => {
    const once = deleteProvider(base(), "p1");
    const twice = deleteProvider(once, "p1");
    expect(twice.providers.map(p => p.id)).toEqual(["p2"]);
    expect(twice).toEqual(once);
  });

  it("删模型：只清引用该模型的分配，同服务商其它模型的分配保留", () => {
    const next = deleteModel(base(), "p1", "m1");
    expect(next.providers[0].models.map(m => m.id)).toEqual(["m2"]);
    expect(next.slots.chat).toBeNull();
    expect(next.slots.titleSummary).toEqual({ providerId: "p1", modelId: "m2" });
  });

  it("删不存在的服务商不改动任何东西（避免无意义的设置写入）", () => {
    const start = base();
    expect(deleteProvider(start, "missing")).toEqual(start);
  });
});
