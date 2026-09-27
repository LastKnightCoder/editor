/**
 * 从 pi 内置目录勾选模型（M3-e）：勾中即带入 api/推理/图片/上下文窗口/最大输出，
 * 不必手打，也不会像手填那样落到瞎猜的 128k/8192 默认值。
 * 已添加的模型默认勾选，取消勾选即移除——移除交由调用方处理（要清引用的分配槽位）。
 */
import { useEffect, useMemo, useState } from "react";
import { ImageIcon, Sparkle } from "lucide-react";
import { Button, Checkbox, Dialog, DialogBody, Input, cn } from "@tau/ui";
import type { LLMModelSetting, PiCatalogModel } from "@/types/pi-llm";
import { useCatalogModels } from "../llmCatalog";

/** 目录模型 → 设置条目：元数据全带上，api 兜底混合 api 服务商 */
export const catalogModelToSetting = (model: PiCatalogModel): LLMModelSetting => ({
  id: model.id,
  name: model.name,
  reasoning: model.reasoning,
  input: model.input,
  contextWindow: model.contextWindow,
  maxTokens: model.maxTokens,
  api: model.api,
});

const formatTokens = (value: number) =>
  value >= 1000 ? `${Math.round(value / 1000)}K` : String(value);

export function ModelPickerDialog({
  open,
  onOpenChange,
  builtin,
  providerName,
  existingIds,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  builtin: string;
  providerName: string;
  /** 该服务商下已配置的模型 id */
  existingIds: string[];
  /** 勾选结果：新增哪些（带元数据）、移除哪些 id */
  onConfirm: (change: { add: LLMModelSetting[]; remove: string[] }) => void;
}) {
  const { models, loading } = useCatalogModels(open ? builtin : undefined);
  const [query, setQuery] = useState("");
  const [checked, setChecked] = useState<Set<string>>(new Set());

  // 打开时以「已配置」为初始勾选态
  useEffect(() => {
    if (open) setChecked(new Set(existingIds));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, existingIds.join("\u0000")]);

  const filtered = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) return models;
    return models.filter(
      model =>
        model.name.toLowerCase().includes(keyword) || model.id.toLowerCase().includes(keyword)
    );
  }, [models, query]);

  const toggle = (id: string) =>
    setChecked(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const submit = () => {
    const existing = new Set(existingIds);
    const add = models
      .filter(model => checked.has(model.id) && !existing.has(model.id))
      .map(catalogModelToSetting);
    const remove = existingIds.filter(id => !checked.has(id));
    onConfirm({ add, remove });
    onOpenChange(false);
  };

  const addCount = [...checked].filter(id => !existingIds.includes(id)).length;
  const removeCount = existingIds.filter(id => !checked.has(id)).length;

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      onAfterClose={() => setQuery("")}
      title="选择模型"
      subtitle={`${providerName} · 勾选要使用的模型`}
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button variant="primary" onClick={submit} disabled={addCount + removeCount === 0}>
            {addCount + removeCount === 0
              ? "没有改动"
              : `保存（新增 ${addCount}${removeCount > 0 ? ` · 移除 ${removeCount}` : ""}）`}
          </Button>
        </>
      }
    >
      <DialogBody>
        <div className="flex flex-col gap-2">
          <Input
            value={query}
            placeholder="搜索模型"
            aria-label="搜索模型"
            onChange={event => setQuery(event.target.value)}
          />
          {loading ? (
            <div className="text-tau-meta text-ink-3 px-2.5 py-3">正在加载模型…</div>
          ) : filtered.length === 0 ? (
            <div className="text-tau-meta text-ink-3 px-2.5 py-3">
              {models.length === 0 ? "该服务商暂时没有可用模型" : "没有匹配的模型"}
            </div>
          ) : (
            <div className="max-h-[360px] overflow-auto">
              {filtered.map(model => {
                const active = checked.has(model.id);
                const inputId = `model-pick-${model.id}`;
                return (
                  <div
                    key={model.id}
                    className={cn(
                      "rounded-tau-sm px-2 py-1.5 transition-colors",
                      active ? "bg-selected" : "hover:bg-hover"
                    )}
                  >
                    <div className="flex items-start gap-2.5">
                      <Checkbox
                        id={inputId}
                        checked={active}
                        onChange={() => toggle(model.id)}
                        className="mt-0.5"
                      />
                      <label htmlFor={inputId} className="min-w-0 flex-1 cursor-pointer">
                        <span className="flex min-w-0 items-center gap-1.5">
                          <span className="text-tau-body text-ink-1 truncate font-medium">
                            {model.name}
                          </span>
                          {model.reasoning && (
                            <Sparkle
                              aria-label="支持推理"
                              className="text-accent-text size-3.5 shrink-0"
                              strokeWidth={1.75}
                            />
                          )}
                          {model.input.includes("image") && (
                            <ImageIcon
                              aria-label="支持图片输入"
                              className="text-ink-3 size-3.5 shrink-0"
                              strokeWidth={1.75}
                            />
                          )}
                        </span>
                        <span className="text-tau-meta text-ink-3 flex min-w-0 flex-wrap gap-x-2">
                          <span className="font-tau-mono truncate">{model.id}</span>
                          <span className="tabular-nums">
                            {formatTokens(model.contextWindow)} 上下文 ·{" "}
                            {formatTokens(model.maxTokens)} 输出
                          </span>
                          {model.cost && (
                            <span className="tabular-nums">
                              ${model.cost.input}/${model.cost.output} 每百万 tokens
                            </span>
                          )}
                        </span>
                      </label>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </DialogBody>
    </Dialog>
  );
}
