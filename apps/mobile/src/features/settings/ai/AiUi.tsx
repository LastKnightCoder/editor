import type { ReactNode } from "react";
import { X } from "lucide-react";
import { BottomSheet } from "../../../components/BottomSheet";
import { CheckBubble } from "../../../components/CheckBubble";
import { GroupLabel } from "../../../components/GroupLabel";
import { cn } from "@tau/ui";
import type { LLMUsageConfigV2 } from "@tau/ai/models";
import type { MobileLlmProvider } from "../../../types";
import { modelLabel, sameUsage } from "../../../services/ai-settings";
import { GroupCard, GroupRow, LetterTile } from "../components/ui";
import { providerLetter, providerTone } from "./useAiSettings";

const BADGE_TONES = {
  ok: "bg-tag-1-soft text-tag-1",
  warn: "bg-warn-soft text-warn",
  reasoning: "bg-tag-3-soft text-tag-3",
  image: "bg-tag-2-soft text-tag-2",
  muted: "bg-page text-ink-2",
} as const;

/** 行内小胶囊：跟在标题文字后面，不独占一行 */
export function AiBadge(props: { tone: keyof typeof BADGE_TONES; children: ReactNode }) {
  return (
    <span
      className={cn(
        "text-tau-micro ml-1.5 inline-flex shrink-0 items-center rounded-full px-[7px] py-px align-[1px] font-semibold",
        BADGE_TONES[props.tone]
      )}
    >
      {props.children}
    </span>
  );
}

export function ModelCapabilities(props: { model: MobileLlmProvider["models"][number] }) {
  return (
    <>
      {props.model.reasoning && <AiBadge tone="reasoning">推理</AiBadge>}
      {props.model.input.includes("image") && <AiBadge tone="image">图片</AiBadge>}
    </>
  );
}

export function ProviderTile(props: { provider: Pick<MobileLlmProvider, "id" | "name"> }) {
  return (
    <LetterTile
      letter={providerLetter(props.provider.name)}
      className={providerTone(props.provider.id)}
    />
  );
}

/** 抽屉标题行：标题左对齐，关闭按钮固定 30px 正圆 */
export function SheetHeader(props: { title: string; description?: string; onClose: () => void }) {
  return (
    <div className="-mx-1 mb-2">
      <div className="flex items-center gap-3">
        <h2 className="text-ink-1 min-w-0 flex-1 truncate text-[17px] font-bold">{props.title}</h2>
        <button
          type="button"
          aria-label="关闭"
          onClick={props.onClose}
          className="bg-page text-ink-2 grid h-[30px] w-[30px] shrink-0 place-items-center rounded-full"
        >
          <X size={16} aria-hidden="true" />
        </button>
      </div>
      {props.description && (
        <p className="text-ink-2 text-tau-sm mt-1 leading-relaxed">{props.description}</p>
      )}
    </div>
  );
}

/** 功能模型选择：按服务商分组单选，未填 Key 的服务商置灰；可清除分配 */
export function ModelPickerSheet(props: {
  open: boolean;
  title: string;
  description?: string;
  providers: MobileLlmProvider[];
  value: LLMUsageConfigV2 | null | undefined;
  busy?: boolean;
  onSelect: (value: LLMUsageConfigV2 | null) => void;
  onOpenProvider: (providerId: string) => void;
  onClose: () => void;
}) {
  return (
    <BottomSheet open={props.open} onClose={props.onClose}>
      <SheetHeader title={props.title} description={props.description} onClose={props.onClose} />
      {props.providers.map(provider => (
        <section key={provider.id}>
          <GroupLabel inset="sheet">{provider.name}</GroupLabel>
          <GroupCard>
            {provider.models.map(model => {
              const ref = { providerId: provider.id, modelId: model.id };
              const selected = sameUsage(props.value, ref);
              return (
                <GroupRow
                  key={model.id}
                  disabled={props.busy}
                  className={cn(!provider.configured && "opacity-45")}
                  onClick={() =>
                    provider.configured
                      ? !selected && props.onSelect(ref)
                      : props.onOpenProvider(provider.id)
                  }
                >
                  <span className="min-w-0 flex-1">
                    <span className="text-ink-1 text-tau-body block truncate font-medium">
                      {modelLabel(model)}
                      <ModelCapabilities model={model} />
                    </span>
                    <span className="text-ink-3 text-tau-sm block truncate">
                      {provider.configured ? model.id : "未填 API Key，点按去填写"}
                    </span>
                  </span>
                  {selected ? (
                    <CheckBubble />
                  ) : (
                    <span
                      aria-hidden="true"
                      className="border-line-1 h-[21px] w-[21px] shrink-0 rounded-full border-[1.5px]"
                    />
                  )}
                </GroupRow>
              );
            })}
          </GroupCard>
        </section>
      ))}
      {props.value && (
        <button
          type="button"
          disabled={props.busy}
          onClick={() => props.onSelect(null)}
          className="text-danger text-tau-body mt-4 h-11 w-full rounded-[14px] font-medium disabled:opacity-50"
        >
          不使用模型
        </button>
      )}
    </BottomSheet>
  );
}
