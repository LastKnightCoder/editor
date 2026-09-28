/**
 * 勾选模型（M3-e 目录 + M3-f 实时获取）：
 * - 内置服务商：先列目录里的模型，元数据（api/推理/图片/上下文窗口/最大输出）自动带入；
 *   可再「从服务商获取」补上目录还没收录的新模型；
 * - 其他服务商（自建/目录外）：打开即向服务商获取当前可用模型。
 * 获取来的模型目录命中时与目录同等可信；未命中只带服务商自报的字段，缺的留空，之后可在编辑里补。
 * 已添加的模型默认勾选，取消勾选即移除——移除交由调用方处理（要清引用的分配槽位）。
 */
import { useEffect, useMemo, useState } from "react";
import { ImageIcon, RefreshCw, Sparkle } from "lucide-react";
import { Button, Checkbox, Dialog, DialogBody, Input, cn } from "@tau/ui";
import type {
  LLMModelSetting,
  LLMProviderSetting,
  PiCatalogModel,
  PiDiscoveredModel,
} from "@/types/pi-llm";
import { piDiscoverModels } from "@/commands/piAi";
import { useCatalogModels } from "@/services/llmCatalog";

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

/** 获取来的模型 → 设置条目：只写有依据的字段，能力未知按最保守（不推理、仅文本） */
export const discoveredModelToSetting = (model: PiDiscoveredModel): LLMModelSetting => ({
  id: model.id,
  ...(model.name !== model.id ? { name: model.name } : {}),
  reasoning: model.reasoning ?? false,
  input: model.input ?? ["text"],
  ...(model.contextWindow ? { contextWindow: model.contextWindow } : {}),
  ...(model.maxTokens ? { maxTokens: model.maxTokens } : {}),
  ...(model.api ? { api: model.api } : {}),
});

interface PickerItem {
  id: string;
  name: string;
  reasoning?: boolean;
  input?: ("text" | "image")[];
  contextWindow?: number;
  maxTokens?: number;
  cost?: { input: number; output: number };
  /** 仅由服务商实时列出、预设列表里没有（新模型或自建服务的模型） */
  fromServiceOnly: boolean;
  setting: LLMModelSetting;
}

/**
 * 合并预设与获取结果：预设在前、按 id 去重（预设元数据更全，重复时保留预设）；
 * 获取结果只追加预设里没有的。
 */
export function mergePickerItems(
  catalog: PiCatalogModel[],
  discovered: PiDiscoveredModel[]
): PickerItem[] {
  const items: PickerItem[] = catalog.map(model => ({
    id: model.id,
    name: model.name,
    reasoning: model.reasoning,
    input: model.input,
    contextWindow: model.contextWindow,
    maxTokens: model.maxTokens,
    cost: model.cost,
    fromServiceOnly: false,
    setting: catalogModelToSetting(model),
  }));
  const known = new Set(items.map(item => item.id));
  for (const model of discovered) {
    if (known.has(model.id)) continue;
    known.add(model.id);
    items.push({
      id: model.id,
      name: model.name,
      reasoning: model.reasoning,
      input: model.input,
      contextWindow: model.contextWindow,
      maxTokens: model.maxTokens,
      cost: model.cost,
      fromServiceOnly: !model.fromCatalog,
      setting: discoveredModelToSetting(model),
    });
  }
  return items;
}

const formatTokens = (value: number) =>
  value >= 1000 ? `${Math.round(value / 1000)}K` : String(value);

type DiscoverState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "done"; models: PiDiscoveredModel[] }
  | { status: "error"; message: string };

export function ModelPickerDialog({
  open,
  onOpenChange,
  provider,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  provider: LLMProviderSetting;
  /** 勾选结果：新增哪些（带元数据）、移除哪些 id */
  onConfirm: (change: { add: LLMModelSetting[]; remove: string[] }) => void;
}) {
  const builtin = provider.builtin;
  const existingIds = provider.models.map(model => model.id);
  const { models: catalog, loading: catalogLoading } = useCatalogModels(open ? builtin : undefined);
  const [discover, setDiscover] = useState<DiscoverState>({ status: "idle" });
  const [query, setQuery] = useState("");
  const [checked, setChecked] = useState<Set<string>>(new Set());

  const runDiscover = () => {
    setDiscover({ status: "loading" });
    void piDiscoverModels(provider)
      .then(result =>
        setDiscover(
          result.ok
            ? { status: "done", models: result.models }
            : { status: "error", message: result.error ?? "获取失败" }
        )
      )
      .catch(error =>
        setDiscover({
          status: "error",
          message: error instanceof Error ? error.message : String(error),
        })
      );
  };

  // 打开时以「已配置」为初始勾选态；没有预设列表的服务商直接去获取
  useEffect(() => {
    if (!open) return;
    setChecked(new Set(existingIds));
    if (!builtin) runDiscover();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const items = useMemo(
    () => mergePickerItems(catalog, discover.status === "done" ? discover.models : []),
    [catalog, discover]
  );

  const filtered = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) return items;
    return items.filter(
      item => item.name.toLowerCase().includes(keyword) || item.id.toLowerCase().includes(keyword)
    );
  }, [items, query]);

  const toggle = (id: string) =>
    setChecked(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const submit = () => {
    const existing = new Set(existingIds);
    const add = items
      .filter(item => checked.has(item.id) && !existing.has(item.id))
      .map(item => item.setting);
    const remove = existingIds.filter(id => !checked.has(id));
    onConfirm({ add, remove });
    onOpenChange(false);
  };

  const addCount = [...checked].filter(id => !existingIds.includes(id)).length;
  const removeCount = existingIds.filter(id => !checked.has(id)).length;
  const discoveredOnly =
    discover.status === "done" ? items.filter(item => item.fromServiceOnly).length : 0;
  const loading = catalogLoading || (!builtin && discover.status === "loading");

  const emptyText =
    items.length > 0
      ? "没有匹配的模型"
      : discover.status === "error"
        ? "没有获取到模型，可关闭后「手动添加」"
        : builtin
          ? "该服务商暂时没有可用模型"
          : "服务商没有返回可用模型，可关闭后「手动添加」";

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      onAfterClose={() => {
        setQuery("");
        setDiscover({ status: "idle" });
      }}
      title="选择模型"
      subtitle={`${provider.name || "未命名"} · 勾选要使用的模型`}
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
          <div className="flex items-center gap-2">
            <Input
              className="flex-1"
              value={query}
              placeholder="搜索模型"
              aria-label="搜索模型"
              onChange={event => setQuery(event.target.value)}
            />
            <Button
              variant="ghost"
              size="sm"
              icon={RefreshCw}
              loading={discover.status === "loading"}
              loadingText="获取中…"
              onClick={runDiscover}
            >
              {builtin ? "从服务商获取" : "重新获取"}
            </Button>
          </div>
          {discover.status === "error" ? (
            <div role="alert" className="text-tau-meta text-warn px-2.5">
              获取模型列表失败：{discover.message}
            </div>
          ) : discover.status === "done" && builtin ? (
            <div className="text-tau-meta text-ink-3 px-2.5">
              {discoveredOnly > 0
                ? `服务商另有 ${discoveredOnly} 个模型不在预设列表里，已追加在末尾`
                : "服务商的模型都已在列表中"}
            </div>
          ) : null}
          {loading ? (
            <div className="text-tau-meta text-ink-3 px-2.5 py-3">正在加载模型…</div>
          ) : filtered.length === 0 ? (
            <div className="text-tau-meta text-ink-3 px-2.5 py-3">{emptyText}</div>
          ) : (
            <div className="max-h-[360px] overflow-auto">
              {filtered.map(item => {
                const active = checked.has(item.id);
                const inputId = `model-pick-${item.id}`;
                return (
                  <div
                    key={item.id}
                    className={cn(
                      "rounded-tau-sm px-2 py-1.5 transition-colors",
                      active ? "bg-selected" : "hover:bg-hover"
                    )}
                  >
                    <div className="flex items-start gap-2.5">
                      <Checkbox
                        id={inputId}
                        checked={active}
                        onChange={() => toggle(item.id)}
                        className="mt-0.5"
                      />
                      <label htmlFor={inputId} className="min-w-0 flex-1 cursor-pointer">
                        <span className="flex min-w-0 items-center gap-1.5">
                          <span className="text-tau-body text-ink-1 truncate font-medium">
                            {item.name}
                          </span>
                          {item.reasoning && (
                            <Sparkle
                              aria-label="支持推理"
                              className="text-accent-text size-3.5 shrink-0"
                              strokeWidth={1.75}
                            />
                          )}
                          {item.input?.includes("image") && (
                            <ImageIcon
                              aria-label="支持图片输入"
                              className="text-ink-3 size-3.5 shrink-0"
                              strokeWidth={1.75}
                            />
                          )}
                        </span>
                        <span className="text-tau-meta text-ink-3 flex min-w-0 flex-wrap gap-x-2">
                          <span className="font-tau-mono truncate">{item.id}</span>
                          {item.contextWindow && item.maxTokens ? (
                            <span className="tabular-nums">
                              {formatTokens(item.contextWindow)} 上下文 ·{" "}
                              {formatTokens(item.maxTokens)} 输出
                            </span>
                          ) : item.contextWindow ? (
                            <span className="tabular-nums">
                              {formatTokens(item.contextWindow)} 上下文
                            </span>
                          ) : null}
                          {item.cost && (
                            <span className="tabular-nums">
                              ${item.cost.input}/${item.cost.output} 每百万 tokens
                            </span>
                          )}
                          {item.fromServiceOnly &&
                            (item.reasoning === undefined ||
                              item.input === undefined ||
                              item.contextWindow === undefined) && (
                              <span>部分能力信息未知，添加后可在编辑中补充</span>
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
