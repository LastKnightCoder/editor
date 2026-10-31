import { useState } from "react";
import { ChevronDown, ChevronRight, Server } from "lucide-react";
import type { PiCatalogProvider } from "@tau/ai/models";
import { BottomSheet } from "../../../components/BottomSheet";
import type { MobileLlmProvider } from "../../../types";
import { ProviderTile, SheetHeader } from "./AiUi";
import { CUSTOM_PRESET, catalogModels, catalogName, catalogPresets } from "./catalog";

/** 同一预设可添加多次（不同账号），id 加序号避免冲突 */
function nextProviderId(base: string, existing: MobileLlmProvider[]) {
  const ids = new Set(existing.map(provider => provider.id));
  if (!ids.has(base)) return base;
  let index = 2;
  while (ids.has(`${base}-${index}`)) index++;
  return `${base}-${index}`;
}

function PresetCard(props: { preset: PiCatalogProvider; onClick: () => void }) {
  const models = catalogModels(props.preset.id);
  return (
    <button
      type="button"
      onClick={props.onClick}
      className="bg-page flex w-full min-w-0 items-center gap-3 rounded-2xl px-3.5 py-3 text-left transition-transform active:scale-[0.98]"
    >
      <ProviderTile provider={{ id: props.preset.id, name: catalogName(props.preset) }} />
      <span className="min-w-0 flex-1">
        <span className="text-ink-1 text-tau-body block font-semibold">
          {catalogName(props.preset)}
        </span>
        <span className="text-ink-3 text-tau-sm block truncate">
          {models
            .slice(0, 3)
            .map(model => model.id)
            .join(" · ")}
        </span>
      </span>
      <ChevronRight size={16} className="text-ink-3 shrink-0" aria-hidden="true" />
    </button>
  );
}

/** 添加服务商：选预设或自定义后进入详情页草稿，保存前不写入设置 */
export function AddProviderSheet(props: {
  open: boolean;
  existing: MobileLlmProvider[];
  onClose: () => void;
  onPick: (draft: { providerId: string; preset: string }) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const presets = catalogPresets();
  const addPreset = (preset: PiCatalogProvider) =>
    props.onPick({ providerId: nextProviderId(preset.id, props.existing), preset: preset.id });
  const addCustom = () =>
    props.onPick({ providerId: nextProviderId("custom", props.existing), preset: CUSTOM_PRESET });

  return (
    <BottomSheet open={props.open} onClose={props.onClose}>
      <SheetHeader
        title="添加服务商"
        description="选一个预设，只需要填 API Key；地址和模型清单自动带好。"
        onClose={props.onClose}
      />
      <div className="mt-3 grid grid-cols-1 gap-2">
        {presets.featured.map(preset => (
          <PresetCard key={preset.id} preset={preset} onClick={() => addPreset(preset)} />
        ))}
        {expanded &&
          presets.others.map(preset => (
            <PresetCard key={preset.id} preset={preset} onClick={() => addPreset(preset)} />
          ))}
        {!expanded && presets.others.length > 0 && (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="text-ink-2 text-tau-meta flex h-10 items-center justify-center gap-1 font-medium"
          >
            更多服务商 · {presets.others.length}
            <ChevronDown size={15} aria-hidden="true" />
          </button>
        )}
        <button
          type="button"
          onClick={addCustom}
          className="border-line-1 flex w-full items-center gap-3 rounded-2xl border-[1.5px] border-dashed px-3.5 py-3 text-left"
        >
          <span className="bg-page text-ink-2 grid h-[34px] w-[34px] shrink-0 place-items-center rounded-xl">
            <Server size={17} strokeWidth={1.9} aria-hidden="true" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="text-ink-1 text-tau-body block font-semibold">自定义</span>
            <span className="text-ink-3 text-tau-sm block">
              OpenAI / Anthropic 兼容地址、本地网关
            </span>
          </span>
          <ChevronRight size={16} className="text-ink-3 shrink-0" aria-hidden="true" />
        </button>
      </div>
    </BottomSheet>
  );
}
