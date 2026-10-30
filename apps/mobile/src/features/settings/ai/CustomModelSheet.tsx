import { useEffect, useState } from "react";
import { BottomSheet } from "../../../components/BottomSheet";
import { GroupCard, GroupRow, SwitchButton } from "../components/ui";
import { SheetHeader } from "./AiUi";
import { TextField } from "./fields";
import { customModel, type ModelSetting } from "./providerDraft";

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
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState("");
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
    if (props.existingIds.has(result.id)) return setError("已有同 ID 的模型");
    props.onAdd(result);
  };

  return (
    <BottomSheet open={props.open} onClose={props.onClose}>
      <SheetHeader
        title="添加模型"
        description="填写服务商文档里的模型 ID 与容量。"
        onClose={props.onClose}
      />
      <GroupCard>
        <TextField
          label="模型 ID"
          value={form.id}
          placeholder="例如 qwen-plus"
          error={error}
          onChange={id => set({ id })}
        />
        <TextField label="显示名称 · 可选" value={form.name} onChange={name => set({ name })} />
        <TextField
          label="上下文窗口（token）"
          inputMode="numeric"
          value={form.contextWindow}
          onChange={contextWindow => set({ contextWindow })}
        />
        <TextField
          label="最大输出（token）"
          inputMode="numeric"
          value={form.maxTokens}
          onChange={maxTokens => set({ maxTokens })}
        />
      </GroupCard>
      <div className="h-3" />
      <GroupCard>
        <GroupRow>
          <span className="text-ink-1 text-tau-body flex-1 font-medium">支持推理</span>
          <SwitchButton
            checked={form.reasoning}
            onChange={() => set({ reasoning: !form.reasoning })}
          />
        </GroupRow>
        <GroupRow>
          <span className="text-ink-1 text-tau-body flex-1 font-medium">支持图片输入</span>
          <SwitchButton checked={form.image} onChange={() => set({ image: !form.image })} />
        </GroupRow>
      </GroupCard>
      <button
        type="button"
        onClick={submit}
        className="bg-accent text-ink-inverse text-tau-body mt-4 h-12 w-full rounded-[14px] font-semibold"
      >
        添加
      </button>
    </BottomSheet>
  );
}
