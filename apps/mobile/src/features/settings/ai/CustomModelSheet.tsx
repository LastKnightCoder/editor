import { llmText, useLlmSettingsI18n } from "./i18n";
import { useEffect, useState } from "react";
import { BottomSheet } from "../../../components/BottomSheet";
import { GroupCard, GroupRow, SwitchButton } from "../components/ui";
import { SheetHeader } from "./AiUi";
import { TextField } from "./fields";
import { customModel, type ModelSetting, type ValidationCode } from "./providerDraft";

const EMPTY = {
  id: "",
  name: "",
  contextWindow: "128000",
  maxTokens: "8192",
  reasoning: false,
  image: false,
};

/** 手动添加目录外模型：容量必填，能力只问推理与图片 */
export function CustomModelSheet(props: {
  open: boolean;
  existingIds: ReadonlySet<string>;
  onClose: () => void;
  onAdd: (model: ModelSetting) => void;
}) {
  useLlmSettingsI18n();

  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState<ValidationCode | "">("");
  useEffect(() => {
    if (props.open) {
      setForm(EMPTY);
      setError("");
    }
  }, [props.open]);
  const set = (next: Partial<typeof EMPTY>) => setForm(current => ({ ...current, ...next }));
  const submit = () => {
    const result = customModel(form);
    if (typeof result === "string") return setError(result);
    if (props.existingIds.has(result.id)) return setError("duplicateModel");
    props.onAdd(result);
  };

  return (
    <BottomSheet open={props.open} onClose={props.onClose}>
      <SheetHeader
        title={llmText("ui.addModel")}
        description={llmText("ui.enterTheModelIDAndCapacitiesFrom")}
        onClose={props.onClose}
      />
      <GroupCard>
        <TextField
          label={llmText("ui.modelID")}
          value={form.id}
          placeholder={llmText("ui.forExampleQwenPlus")}
          error={error ? llmText(`validation.${error}`) : undefined}
          onChange={id => set({ id })}
        />
        <TextField
          label={llmText("ui.displayNameOptional2")}
          value={form.name}
          onChange={name => set({ name })}
        />
        <TextField
          label={llmText("ui.contextWindowTokens2")}
          inputMode="numeric"
          value={form.contextWindow}
          onChange={contextWindow => set({ contextWindow })}
        />
        <TextField
          label={llmText("ui.maximumOutputTokens2")}
          inputMode="numeric"
          value={form.maxTokens}
          onChange={maxTokens => set({ maxTokens })}
        />
      </GroupCard>
      <div className="h-3" />
      <GroupCard>
        <GroupRow>
          <span className="text-ink-1 text-tau-body flex-1 font-medium">
            {llmText("ui.supportsReasoning")}
          </span>
          <SwitchButton
            checked={form.reasoning}
            onChange={() => set({ reasoning: !form.reasoning })}
          />
        </GroupRow>
        <GroupRow>
          <span className="text-ink-1 text-tau-body flex-1 font-medium">
            {llmText("ui.supportsImageInput")}
          </span>
          <SwitchButton checked={form.image} onChange={() => set({ image: !form.image })} />
        </GroupRow>
      </GroupCard>
      <button
        type="button"
        onClick={submit}
        className="bg-accent text-ink-inverse text-tau-body mt-4 h-12 w-full rounded-[14px] font-semibold"
      >
        {llmText("ui.add")}
      </button>
    </BottomSheet>
  );
}
