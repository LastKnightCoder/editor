/**
 * 连接模型：设置 › 大语言模型。添加服务商（选内置目录项，填 API Key）→ 选择模型（勾选后保存）
 * → 功能分配（为各功能指定模型，未分配数显示在标签角标）。
 * 结构按 features/settings 的 SettingsScreen、LLMSection、ProviderLayout、ProviderCreateDialog、
 * ModelPickerDialog 重建；下拉改为点击轮换，便于在示意里操作。
 */
import { useState, type ReactNode } from "react";
import {
  ArrowLeft,
  ChevronsUpDown,
  ImageIcon,
  Layers,
  Link2,
  Palette,
  Plus,
  RefreshCw,
  Server,
  Sparkle,
  Sparkles,
  AudioLines,
} from "lucide-react";
import { Checkbox, cn } from "@tau/ui";

interface CatalogModel {
  id: string;
  name: string;
  reasoning: boolean;
  context: string;
}

const CATALOG = [
  {
    id: "deepseek",
    name: "DeepSeek",
    baseUrl: "https://api.deepseek.com",
    count: 2,
  },
  {
    id: "openai",
    name: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    count: 38,
  },
  {
    id: "anthropic",
    name: "Anthropic",
    baseUrl: "https://api.anthropic.com",
    count: 12,
  },
];

const MODELS: CatalogModel[] = [
  {
    id: "deepseek-chat",
    name: "DeepSeek V3",
    reasoning: false,
    context: "64K",
  },
  {
    id: "deepseek-reasoner",
    name: "DeepSeek R1",
    reasoning: true,
    context: "64K",
  },
];

const FEATURES = [
  {
    key: "chat",
    group: "对话与写作",
    label: "对话功能",
    desc: "聊天与写作助手的主力模型",
  },
  {
    key: "title",
    group: "内容处理",
    label: "标题总结",
    desc: "笔记与文档的命名摘要",
  },
  {
    key: "insights",
    group: "内容处理",
    label: "AI 洞见",
    desc: "对照你的其他笔记分析一篇内容",
  },
];

const NAV = [
  { group: "通用", items: [{ label: "外观", icon: Palette }] },
  {
    group: "AI 服务",
    items: [
      { label: "大语言模型", icon: Sparkles },
      { label: "嵌入模型", icon: Layers },
      { label: "图片生成", icon: ImageIcon },
      { label: "语音", icon: AudioLines },
    ],
  },
];

type Dialog = null | "catalog" | "form" | "models";

const BTN_GHOST =
  "rounded-tau-sm text-tau-meta text-ink-2 hover:bg-hover hover:text-ink-1 inline-flex h-7 items-center gap-1.5 px-2.5 disabled:opacity-40";
const BTN_PRIMARY =
  "bg-accent text-ink-inverse hover:bg-accent-hover h-8 rounded-[8px] px-3.5 text-[13px] font-medium disabled:opacity-50";
const BTN_SECONDARY =
  "border-line-1 bg-surface hover:bg-hover h-8 rounded-[8px] border px-3.5 text-[13px]";

export default function LlmSetupDemo() {
  const [tab, setTab] = useState<"providers" | "assignment">("providers");
  const [dialog, setDialog] = useState<Dialog>(null);
  const [provider, setProvider] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set(["deepseek-chat"]));
  const [models, setModels] = useState<CatalogModel[]>([]);
  const [slots, setSlots] = useState<Record<string, string | null>>({});

  const unassigned = FEATURES.filter(feature => !slots[feature.key]).length;
  const usage = (id: string) => Object.values(slots).filter(v => v === id).length;

  const cycle = (key: string) => {
    const order = [null, ...models.map(model => model.id)];
    const index = order.indexOf(slots[key] ?? null);
    setSlots({ ...slots, [key]: order[(index + 1) % order.length] });
  };

  return (
    <div className="bg-page font-tau text-tau-body text-ink-1 border-line-1 shadow-float relative grid h-[480px] grid-cols-[176px_minmax(0,1fr)] overflow-hidden rounded-[14px] border select-none max-sm:grid-cols-1">
      <nav className="flex flex-col px-2.5 pt-3 pb-3 max-sm:hidden">
        <span className="text-ink-2 text-tau-body flex h-8 items-center gap-2.5 rounded-[10px] px-2.5">
          <ArrowLeft className="size-[15px]" strokeWidth={1.75} />
          返回应用
        </span>
        {NAV.map(group => (
          <div key={group.group} className="mt-3">
            <div className="text-tau-tiny text-ink-3 px-2.5 pb-1.5">{group.group}</div>
            {group.items.map((item, index) => {
              const Icon = item.icon;
              const active = group.group === "AI 服务" && index === 0;
              return (
                <span
                  key={item.label}
                  className={cn(
                    "text-tau-body flex h-8 items-center gap-2.5 rounded-[10px] px-2.5",
                    active ? "bg-selected text-ink-1 font-medium" : "text-ink-2"
                  )}
                >
                  <Icon className="size-[15px]" strokeWidth={1.75} />
                  {item.label}
                </span>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="scrollbar-hide min-w-0 overflow-y-auto px-7 pt-5 pb-6 max-sm:px-4">
        <h3 className="text-tau-title-lg font-semibold">大语言模型</h3>
        <p className="text-tau-meta text-ink-2 mt-1">接入服务商与模型，再为各项功能指定模型</p>

        <div role="tablist" aria-label="大语言模型视图" className="mt-4 mb-4 flex gap-[22px]">
          {(
            [
              ["providers", "服务商与模型", 0],
              ["assignment", "功能分配", unassigned],
            ] as const
          ).map(([key, label, badge]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={tab === key}
              onClick={() => setTab(key)}
              className={cn(
                "text-tau-body after:bg-accent relative inline-flex items-center gap-1.5 pt-1 pb-[7px] after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:rounded-full",
                tab === key
                  ? "text-ink-1 font-semibold after:opacity-100"
                  : "text-ink-2 hover:text-ink-1 after:opacity-0"
              )}
            >
              {label}
              {badge > 0 && (
                <span className="bg-accent-soft text-accent-text min-w-[18px] rounded-full px-1.5 text-center text-[11px] leading-[18px] font-semibold tabular-nums">
                  {badge}
                </span>
              )}
            </button>
          ))}
        </div>

        {tab === "providers" ? (
          <div className="bg-surface shadow-card rounded-[14px] p-1.5">
            <div className="border-line-1 -mx-1.5 -mt-1.5 flex items-center gap-1 border-b p-1.5">
              {provider && (
                <span className="bg-selected text-accent-text rounded-tau-sm text-tau-body inline-flex h-8 items-center gap-1.5 px-3 font-medium">
                  DeepSeek
                  <span className="text-tau-micro text-ink-3 font-normal tabular-nums">
                    {models.length}
                  </span>
                </span>
              )}
              <button
                type="button"
                onClick={() => setDialog("catalog")}
                className={cn(
                  "rounded-tau-sm text-tau-body text-ink-2 hover:bg-hover hover:text-ink-1 ml-auto inline-flex h-8 items-center gap-1.5 px-3",
                  !provider && "text-accent-text animate-pulse"
                )}
              >
                <Plus className="size-3.5" strokeWidth={1.75} />
                添加服务商
              </button>
            </div>

            {!provider ? (
              <p className="text-tau-meta text-ink-2 px-3 py-10 text-center">
                还没有服务商——点击「添加服务商」填入凭据，再添加模型
              </p>
            ) : (
              <>
                <Section title="连接" description="DeepSeek 的名称与凭据">
                  <Row label="API Key">
                    <span className="font-tau-mono text-ink-2 truncate text-[12.5px]">
                      {"•".repeat(Math.min(apiKey.length, 18)) || "（未填写）"}
                    </span>
                  </Row>
                  <Row label="Base URL" last>
                    <span className="font-tau-mono text-ink-2 truncate text-[12.5px]">
                      https://api.deepseek.com
                    </span>
                  </Row>
                </Section>
                <Section
                  title="模型"
                  description={`${models.length} 个 · 在「功能分配」中指定给各项功能`}
                  action={
                    <button
                      type="button"
                      onClick={() => setDialog("models")}
                      className={cn(BTN_GHOST, models.length === 0 && "text-accent-text")}
                    >
                      <Sparkles className="size-3.5" strokeWidth={1.75} />
                      选择模型
                    </button>
                  }
                >
                  {models.length === 0 ? (
                    <p className="text-tau-meta text-ink-2 px-3 py-5 text-center">
                      暂无模型——点击「选择模型」勾选要使用的模型
                    </p>
                  ) : (
                    models.map((model, index) => (
                      <div
                        key={model.id}
                        className={cn(
                          "flex min-h-[48px] items-center gap-3 px-3 py-2",
                          index > 0 && "border-line-2 border-t"
                        )}
                      >
                        <span className="font-tau-mono min-w-0 flex-1 truncate text-[12.5px] font-medium">
                          {model.name}
                          {model.reasoning && (
                            <span className="bg-accent-soft text-accent-text ml-2 rounded-full px-1.5 py-px font-sans text-[11px]">
                              推理
                            </span>
                          )}
                        </span>
                        <span
                          className={cn(
                            "text-tau-sm flex flex-none items-center gap-1 tabular-nums",
                            usage(model.id) > 0 ? "text-ink-2" : "text-ink-3"
                          )}
                        >
                          <Link2 className="size-3" strokeWidth={1.75} />
                          {usage(model.id) > 0 ? `${usage(model.id)} 项功能在用` : "未使用"}
                        </span>
                      </div>
                    ))
                  )}
                </Section>
              </>
            )}
          </div>
        ) : (
          ["对话与写作", "内容处理"].map(group => (
            <div key={group} className="mb-5">
              <h4 className="text-tau-body-lg px-1 pb-2 font-semibold">{group}</h4>
              <div className="bg-surface shadow-card rounded-[14px] p-1.5">
                {FEATURES.filter(feature => feature.group === group).map((feature, index) => {
                  const current = models.find(model => model.id === slots[feature.key]);
                  return (
                    <div
                      key={feature.key}
                      className={cn(
                        "flex items-center gap-3 px-3 py-2.5",
                        index > 0 && "border-line-2 border-t"
                      )}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="text-tau-body-lg font-medium">{feature.label}</div>
                        <div className="text-tau-meta text-ink-2 truncate">{feature.desc}</div>
                      </div>
                      <button
                        type="button"
                        disabled={models.length === 0}
                        onClick={() => cycle(feature.key)}
                        className={cn(
                          "border-line-1 hover:border-ink-3 rounded-tau-sm flex h-8 w-[170px] flex-none items-center justify-between gap-2 border px-2.5 text-[13px] disabled:opacity-60",
                          current ? "text-ink-1" : "text-ink-3"
                        )}
                      >
                        <span className="truncate">
                          {current
                            ? `DeepSeek · ${current.name}`
                            : models.length
                              ? "未分配"
                              : "暂无模型——先在上方添加"}
                        </span>
                        <ChevronsUpDown
                          className="text-ink-3 size-3.5 flex-none"
                          strokeWidth={1.75}
                        />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>

      {dialog && (
        <div className="bg-overlay animate-doc-in absolute inset-0 z-10 grid place-items-center p-4">
          <div className="bg-surface shadow-float w-[380px] max-w-full rounded-[16px] p-5">
            {dialog === "catalog" && (
              <>
                <b className="text-tau-body-lg font-semibold">新建服务商</b>
                <p className="text-tau-meta text-ink-3 mt-0.5">选择要接入的服务商</p>
                <div className="mt-3 flex flex-col">
                  <span className="rounded-tau-sm flex items-center gap-2.5 px-2.5 py-2">
                    <Server className="text-ink-3 size-4" strokeWidth={1.75} />
                    <span className="min-w-0 flex-1">
                      <span className="text-tau-body block font-medium">其他服务商</span>
                      <span className="text-tau-meta text-ink-3 block">
                        自己搭建的服务，或上面列表里没有的服务商
                      </span>
                    </span>
                  </span>
                  <div className="bg-line my-1 h-px" />
                  {CATALOG.map(item => (
                    <button
                      key={item.id}
                      type="button"
                      disabled={item.id !== "deepseek"}
                      onClick={() => setDialog("form")}
                      className={cn(
                        "hover:bg-hover rounded-tau-sm flex items-center gap-2.5 px-2.5 py-2 text-left disabled:hover:bg-transparent",
                        item.id === "deepseek" && "bg-hover"
                      )}
                    >
                      <Sparkles className="text-accent-text size-4" strokeWidth={1.75} />
                      <span className="min-w-0 flex-1">
                        <span className="text-tau-body block font-medium">{item.name}</span>
                        <span className="text-tau-meta text-ink-3 block truncate">
                          {item.baseUrl}
                        </span>
                      </span>
                      <span className="text-tau-tiny text-ink-3 tabular-nums">
                        {item.count} 个模型
                      </span>
                    </button>
                  ))}
                </div>
                <div className="mt-4 flex justify-end">
                  <button type="button" onClick={() => setDialog(null)} className={BTN_SECONDARY}>
                    取消
                  </button>
                </div>
              </>
            )}

            {dialog === "form" && (
              <>
                <b className="text-tau-body-lg font-semibold">新建服务商</b>
                <p className="text-tau-meta text-ink-3 mt-0.5">填入 API Key 即可使用</p>
                <div className="mt-3 flex flex-col gap-3">
                  <Field label="名称" value="DeepSeek" />
                  <Field label="Base URL" value="https://api.deepseek.com" mono />
                  <label className="flex flex-col gap-1.5">
                    <span className="text-tau-meta text-ink-2 font-medium">
                      API Key（可稍后补填）
                    </span>
                    <input
                      type="password"
                      value={apiKey}
                      placeholder="sk-…"
                      onChange={event => setApiKey(event.target.value)}
                      className="border-line-1 focus:border-accent font-tau-mono h-8 rounded-[8px] border bg-transparent px-2.5 text-[13px] outline-none select-text"
                    />
                  </label>
                  {!apiKey && (
                    <button
                      type="button"
                      onClick={() => setApiKey("sk-demo-7f3a9c2e81b4")}
                      className="text-accent-text text-tau-sm self-start hover:underline"
                    >
                      填入示例 Key
                    </button>
                  )}
                </div>
                <div className="mt-4 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setDialog("catalog")}
                    className={BTN_SECONDARY}
                  >
                    返回
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setProvider(true);
                      setDialog(null);
                    }}
                    className={BTN_PRIMARY}
                  >
                    创建
                  </button>
                </div>
              </>
            )}

            {dialog === "models" && (
              <>
                <b className="text-tau-body-lg font-semibold">选择模型</b>
                <p className="text-tau-meta text-ink-3 mt-0.5">DeepSeek · 勾选要使用的模型</p>
                <span className="text-tau-sm text-ink-3 mt-2 inline-flex items-center gap-1">
                  <RefreshCw className="size-3" strokeWidth={1.75} />
                  从服务商获取
                </span>
                <div className="mt-2 flex flex-col gap-1">
                  {MODELS.map(model => {
                    const on = picked.has(model.id);
                    return (
                      <label
                        key={model.id}
                        className={cn(
                          "rounded-tau-sm flex cursor-pointer items-start gap-2.5 px-2 py-1.5",
                          on ? "bg-selected" : "hover:bg-hover"
                        )}
                      >
                        <Checkbox
                          checked={on}
                          className="mt-0.5"
                          onChange={() => {
                            const next = new Set(picked);
                            if (on) next.delete(model.id);
                            else next.add(model.id);
                            setPicked(next);
                          }}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="text-tau-body flex items-center gap-1.5 font-medium">
                            {model.name}
                            {model.reasoning && (
                              <Sparkle
                                aria-label="支持推理"
                                className="text-accent-text size-3.5"
                                strokeWidth={1.75}
                              />
                            )}
                          </span>
                          <span className="text-tau-meta text-ink-3 flex gap-2">
                            <span className="font-tau-mono">{model.id}</span>
                            <span className="tabular-nums">{model.context} 上下文</span>
                          </span>
                        </span>
                      </label>
                    );
                  })}
                </div>
                <div className="mt-4 flex justify-end gap-2">
                  <button type="button" onClick={() => setDialog(null)} className={BTN_SECONDARY}>
                    取消
                  </button>
                  <button
                    type="button"
                    disabled={picked.size === 0}
                    onClick={() => {
                      setModels(MODELS.filter(model => picked.has(model.id)));
                      setDialog(null);
                    }}
                    className={BTN_PRIMARY}
                  >
                    {picked.size ? `保存（新增 ${picked.size} 个）` : "没有改动"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Section({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="px-1.5 pt-2.5 pb-1.5">
      <div className="flex min-h-8 items-center gap-3 pb-1.5 pl-1.5">
        <div className="flex min-w-0 flex-1 items-baseline gap-2">
          <h4 className="text-tau-body-lg flex-none font-semibold">{title}</h4>
          <p className="text-tau-meta text-ink-2 truncate">{description}</p>
        </div>
        {action}
      </div>
      <div className="rounded-tau-md shadow-[inset_0_0_0_1px_var(--color-line-1)]">{children}</div>
    </section>
  );
}

function Row({ label, last, children }: { label: string; last?: boolean; children: ReactNode }) {
  return (
    <div
      className={cn(
        "flex min-h-[44px] items-center gap-3 px-3 py-2",
        !last && "border-line-2 border-b"
      )}
    >
      <span className="text-tau-body-lg w-[88px] flex-none font-medium">{label}</span>
      <span className="flex min-w-0 flex-1 justify-end">{children}</span>
    </div>
  );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-tau-meta text-ink-2 font-medium">{label}</span>
      <span
        className={cn(
          "border-line-1 text-ink-1 flex h-8 items-center rounded-[8px] border px-2.5 text-[13px]",
          mono && "font-tau-mono"
        )}
      >
        {value}
      </span>
    </div>
  );
}
