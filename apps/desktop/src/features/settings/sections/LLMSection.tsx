/**
 * 大语言模型 —— AI 服务商接入与各功能的主力模型分配（llm-designs.html 案 1 定稿）。
 *
 * 三节：服务商（切换条 + 凭据字段网格——点选仅切换「正在编辑哪家」，服务商没有
 * 「当前/生效」语义，各功能在下方分配节独立指定模型，不同于同步/图床的 active）→
 * 模型（行流 + 能力/参数 chips + 在用计数，增删改走浮层表单）→ 功能分配
 * （下划线式分类 tab + 组合选择器：searchable Select 按服务商分组，选项行 =
 *   模型名 + 能力角标，取代 legacy 两级下拉）。删除服务商/模型时一并清空引用它们的分配槽位，
 * 模型改名时分配引用跟随——legacy 均会留悬空引用。
 */

import { useMemo, useState, type ReactNode } from "react";
import clsx from "clsx";
import { produce } from "immer";
import { v4 as uuidv4 } from "uuid";
import {
  AudioLines,
  ChevronDown,
  Copy,
  Eye,
  EyeOff,
  File as FileIcon,
  Globe,
  Image as ImageIcon,
  KeyRound,
  Link2,
  Pencil,
  Plus,
  SlidersHorizontal,
  Sparkle,
  Trash2,
  Video,
  type LucideIcon,
} from "lucide-react";
import { Button, ConfirmDialog, Dialog, IconButton, Input, Select, toast } from "@tau/ui";
import useSettingStore, { type ISetting } from "@/stores/useSettingStore";
import type { LLMUsageConfig, ModelConfig, ProviderConfig } from "@/types/llm";
import { SettingRow } from "../components/SettingRow";
import { SectionTitle } from "../components/SectionTitle";

type FeatureKey = keyof ISetting["llmUsageSettings"];

interface FeatureDef {
  key: FeatureKey;
  label: string;
  desc: string;
}

const ASSIGNMENT_CATEGORIES: Array<{ label: string; features: FeatureDef[] }> = [
  {
    label: "对话与写作",
    features: [{ key: "chat", label: "对话功能", desc: "聊天与写作助手的主力模型" }],
  },
  {
    label: "内容处理",
    features: [
      { key: "titleSummary", label: "标题总结", desc: "笔记与文档的命名摘要" },
      { key: "webClip", label: "网页剪藏", desc: "剪藏页面的正文抽取与清洗" },
    ],
  },
  {
    label: "多媒体",
    features: [
      { key: "podcastGeneration", label: "播客生成", desc: "长文转播客脚本" },
      { key: "videoSummary", label: "视频总结", desc: "视频转写稿的摘要与要点" },
      { key: "videoEbookRewrite", label: "视频电子书重写", desc: "视频内容重写为电子书章节" },
      { key: "transcriptionOptimization", label: "转录断句优化", desc: "语音转录文本的断句与顺滑" },
    ],
  },
  {
    label: "学习辅助",
    features: [
      { key: "flashcardGeneration", label: "闪卡生成", desc: "笔记内容转复习闪卡" },
      { key: "aiJudgement", label: "答案评判", desc: "复习答案的打分与讲评" },
      {
        key: "vibeLearningImageDescription",
        label: "图片理解",
        desc: "Vibe Learning 的图片描述，需带图片能力的模型",
      },
    ],
  },
];

const FEATURE_LABELS = Object.fromEntries(
  ASSIGNMENT_CATEGORIES.flatMap(category => category.features.map(f => [f.key, f.label]))
) as Record<FeatureKey, string>;

const CAPABILITY_DEFS: Array<{ key: string; label: string; icon: LucideIcon }> = [
  { key: "online", label: "联网", icon: Globe },
  { key: "thinking", label: "思考", icon: Sparkle },
  { key: "image", label: "图片", icon: ImageIcon },
  { key: "video", label: "视频", icon: Video },
  { key: "audio", label: "音频", icon: AudioLines },
  { key: "file", label: "文件", icon: FileIcon },
];

/** image 能力兼容 legacy 的 multimodal 旧字段 */
function hasCapability(model: ModelConfig, key: string): boolean {
  const features = model.features;
  if (!features) return false;
  if (key === "image") return Boolean(features.image ?? features.multimodal);
  return Boolean(features[key as keyof typeof features]);
}

function capabilityLabels(model: ModelConfig): string[] {
  return CAPABILITY_DEFS.filter(def => hasCapability(model, def.key)).map(def => def.label);
}

/** 引用命中的功能槽位清单（删除保护的提示来源） */
function featuresUsing(
  usageSettings: Record<string, LLMUsageConfig | null>,
  match: (usage: LLMUsageConfig) => boolean
): FeatureKey[] {
  return (Object.keys(usageSettings) as FeatureKey[]).filter(key => {
    const usage = usageSettings[key];
    return usage !== null && match(usage);
  });
}

interface ModelFormState {
  name: string;
  description: string;
  capabilities: Record<string, boolean>;
  messageFormat: "openai" | "claude";
  apiProtocol: "chat-completions" | "responses";
  maxOutputTokens: string;
  contextWindowK: string;
  temperature: string;
  userAgent: string;
  /** 编辑态按旧模型 ID 定位（支持改名） */
  initialName: string;
}

function blankModelForm(): ModelFormState {
  return {
    name: "",
    description: "",
    capabilities: {},
    messageFormat: "openai",
    apiProtocol: "chat-completions",
    maxOutputTokens: "",
    contextWindowK: "",
    temperature: "",
    userAgent: "",
    initialName: "",
  };
}

function modelToForm(model: ModelConfig): ModelFormState {
  return {
    name: model.name,
    description: model.description,
    capabilities: Object.fromEntries(
      CAPABILITY_DEFS.map(def => [def.key, hasCapability(model, def.key)])
    ),
    messageFormat: model.messageFormat ?? "openai",
    apiProtocol: model.apiProtocol ?? "chat-completions",
    maxOutputTokens: typeof model.maxOutputTokens === "number" ? String(model.maxOutputTokens) : "",
    contextWindowK: typeof model.contextWindowK === "number" ? String(model.contextWindowK) : "",
    temperature: typeof model.temperature === "number" ? String(model.temperature) : "",
    userAgent: model.userAgent ?? "",
    initialName: model.name,
  };
}

function CapChip({ label }: { label: string }) {
  return (
    <span className="bg-group text-ink-2 text-tau-tiny rounded-full px-2 font-medium leading-[17px]">
      {label}
    </span>
  );
}

function MetaChip({ children }: { children: ReactNode }) {
  return (
    <span className="border-line-1 text-ink-3 font-tau-mono text-tau-tiny rounded-full border px-2 tabular-nums leading-[17px]">
      {children}
    </span>
  );
}

/** 组合选择器的选项行：模型名 + 能力角标（供应商由分组头承担，行保持短；触发器回填同 label） */
function ModelOptionLabel({ model }: { model: ModelConfig }) {
  const caps = capabilityLabels(model);
  return (
    <span className="flex min-w-0 items-baseline gap-1.5">
      <span className="font-tau-mono truncate">{model.name}</span>
      {caps.length > 0 && (
        <span className="text-tau-tiny text-ink-3 flex-none">{caps.join(" · ")}</span>
      )}
    </span>
  );
}

export function LLMSection() {
  const llmConfigs = useSettingStore(s => s.setting.llmConfigs);
  const llmUsageSettings = useSettingStore(s => s.setting.llmUsageSettings);
  const updateUsage = useSettingStore(s => s.updateLLMUsageSetting);

  /* ── 切换条：editingId 失效时回落第一家 ── */
  const [editingId, setEditingId] = useState<string | null>(null);
  const editing = llmConfigs.find(p => p.id === editingId) ?? llmConfigs[0];
  const [showApiKey, setShowApiKey] = useState(false);

  const mutateProviders = (fn: (providers: ProviderConfig[]) => void) => {
    useSettingStore.setState(s => ({
      setting: produce(s.setting, draft => fn(draft.llmConfigs)),
    }));
  };

  const mutateUsage = (fn: (slots: Record<string, LLMUsageConfig | null>) => void) => {
    useSettingStore.setState(s => ({
      setting: produce(s.setting, draft => fn(draft.llmUsageSettings)),
    }));
  };

  const updateProviderField = (field: "name" | "baseUrl" | "apiKey", value: string) => {
    if (!editing) return;
    mutateProviders(providers => {
      const target = providers.find(p => p.id === editing.id);
      if (target) target[field] = value;
    });
  };

  const copyApiKey = async (key: string) => {
    if (!key) {
      toast.info("API Key 为空");
      return;
    }
    try {
      await navigator.clipboard.writeText(key);
      toast.success("API Key 已复制到剪贴板");
    } catch {
      toast.error("复制失败，请重试");
    }
  };

  /* ── 新建服务商（浮层表单） ── */
  const [providerCreateOpen, setProviderCreateOpen] = useState(false);
  const [providerForm, setProviderForm] = useState({ name: "", baseUrl: "", apiKey: "" });

  const openProviderCreate = () => {
    setProviderForm({ name: "", baseUrl: "", apiKey: "" });
    setProviderCreateOpen(true);
  };

  const submitProviderCreate = () => {
    const name = providerForm.name.trim();
    const baseUrl = providerForm.baseUrl.trim();
    if (!name || !baseUrl) {
      toast.warning("请填写名称与 Base URL");
      return;
    }
    const id = uuidv4();
    mutateProviders(providers => {
      providers.push({ id, name, baseUrl, apiKey: providerForm.apiKey, models: [] });
    });
    setEditingId(id);
    setProviderCreateOpen(false);
  };

  /* ── 删除服务商（确认弹层，引用槽位一并清空） ── */
  const [providerDeleteOpen, setProviderDeleteOpen] = useState(false);
  const affectedByProvider = editing
    ? featuresUsing(llmUsageSettings, usage => usage.providerId === editing.id)
    : [];

  const confirmProviderDelete = () => {
    if (!editing) return;
    const id = editing.id;
    if (affectedByProvider.length > 0) {
      mutateUsage(slots => {
        affectedByProvider.forEach(key => {
          slots[key] = null;
        });
      });
    }
    mutateProviders(providers => {
      const index = providers.findIndex(p => p.id === id);
      if (index !== -1) providers.splice(index, 1);
    });
    setEditingId(null);
    setProviderDeleteOpen(false);
  };

  /* ── 模型增删改（浮层表单：能力 chips + 高级折叠） ── */
  const [modelDialog, setModelDialog] = useState<{ open: boolean; action: "create" | "edit" }>({
    open: false,
    action: "create",
  });
  const [modelForm, setModelForm] = useState<ModelFormState>(blankModelForm);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [modelDelete, setModelDelete] = useState<ModelConfig | null>(null);

  const openModelCreate = () => {
    setModelForm(blankModelForm());
    setAdvancedOpen(false);
    setModelDialog({ open: true, action: "create" });
  };

  const openModelEdit = (model: ModelConfig) => {
    setModelForm(modelToForm(model));
    setAdvancedOpen(Boolean(model.userAgent || model.temperature !== undefined));
    setModelDialog({ open: true, action: "edit" });
  };

  const submitModelForm = () => {
    if (!editing) return;
    const name = modelForm.name.trim();
    const description = modelForm.description.trim();
    if (!name || !description) {
      toast.warning("请填写模型 ID 与描述");
      return;
    }
    const duplicate =
      modelDialog.action === "create"
        ? editing.models.some(m => m.name === name)
        : modelForm.initialName !== name && editing.models.some(m => m.name === name);
    if (duplicate) {
      toast.warning("该服务商下已存在同名模型");
      return;
    }
    const parsedMaxTokens = Number.parseInt(modelForm.maxOutputTokens, 10);
    const parsedContextK = Number.parseInt(modelForm.contextWindowK, 10);
    const parsedTemperature = Number.parseFloat(modelForm.temperature);
    const cap = (key: string) => Boolean(modelForm.capabilities[key]);
    const next: ModelConfig = {
      name,
      description,
      features: {
        online: cap("online"),
        thinking: cap("thinking"),
        image: cap("image"),
        video: cap("video"),
        audio: cap("audio"),
        file: cap("file"),
      },
      messageFormat: modelForm.messageFormat,
      apiProtocol:
        modelForm.messageFormat === "openai" ? modelForm.apiProtocol : "chat-completions",
      maxOutputTokens:
        modelForm.messageFormat === "claude" &&
        Number.isFinite(parsedMaxTokens) &&
        parsedMaxTokens > 0
          ? parsedMaxTokens
          : undefined,
      contextWindowK:
        Number.isFinite(parsedContextK) && parsedContextK > 0 ? parsedContextK : undefined,
      userAgent: modelForm.userAgent.trim() || undefined,
      temperature:
        Number.isFinite(parsedTemperature) && parsedTemperature >= 0
          ? parsedTemperature
          : undefined,
    };
    const providerId = editing.id;
    const initialName = modelForm.initialName;
    mutateProviders(providers => {
      const provider = providers.find(p => p.id === providerId);
      if (!provider) return;
      if (modelDialog.action === "create") {
        provider.models.push(next);
      } else {
        const index = provider.models.findIndex(m => m.name === initialName);
        if (index !== -1) provider.models[index] = next;
      }
    });
    // 改名后引用旧名的分配槽位跟随
    if (modelDialog.action === "edit" && initialName !== name) {
      mutateUsage(slots => {
        (Object.keys(slots) as FeatureKey[]).forEach(key => {
          const usage = slots[key];
          if (usage && usage.providerId === providerId && usage.modelName === initialName) {
            usage.modelName = name;
          }
        });
      });
    }
    setModelDialog({ open: false, action: "create" });
  };

  const affectedByModel =
    editing && modelDelete
      ? featuresUsing(
          llmUsageSettings,
          usage => usage.providerId === editing.id && usage.modelName === modelDelete.name
        )
      : [];

  const confirmModelDelete = () => {
    if (!editing || !modelDelete) return;
    const providerId = editing.id;
    const modelName = modelDelete.name;
    if (affectedByModel.length > 0) {
      mutateUsage(slots => {
        affectedByModel.forEach(key => {
          slots[key] = null;
        });
      });
    }
    mutateProviders(providers => {
      const provider = providers.find(p => p.id === providerId);
      if (provider) provider.models = provider.models.filter(m => m.name !== modelName);
    });
    setModelDelete(null);
  };

  const usageCount = (providerId: string, modelName: string) =>
    featuresUsing(
      llmUsageSettings,
      usage => usage.providerId === providerId && usage.modelName === modelName
    ).length;

  /* ── 功能分配：分类 tab + 组合选择器 ── */
  const [category, setCategory] = useState(ASSIGNMENT_CATEGORIES[0].label);
  const activeCategory =
    ASSIGNMENT_CATEGORIES.find(c => c.label === category) ?? ASSIGNMENT_CATEGORIES[0];

  /** 全部 (服务商, 模型) 平铺；选项 value 为下标，选择时反查成 providerId + modelName */
  const modelEntries = useMemo(
    () => llmConfigs.flatMap(provider => provider.models.map(model => ({ provider, model }))),
    [llmConfigs]
  );

  const modelOptions = modelEntries.map((entry, index) => ({
    value: String(index),
    group: entry.provider.name,
    label: <ModelOptionLabel model={entry.model} />,
    searchText: `${entry.provider.name} ${entry.model.name} ${entry.model.description ?? ""} ${capabilityLabels(entry.model).join(" ")}`,
  }));

  const renderAssignmentRow = (feature: FeatureDef) => {
    const usage = llmUsageSettings[feature.key];
    const selectedIndex = usage
      ? modelEntries.findIndex(
          entry => entry.provider.id === usage.providerId && entry.model.name === usage.modelName
        )
      : -1;
    return (
      <SettingRow key={feature.key} title={feature.label} description={feature.desc}>
        <Select
          aria-label={`${feature.label}的模型`}
          className="w-[250px]"
          searchable
          placeholder="未分配"
          emptyText="暂无模型——先在上方添加"
          value={selectedIndex >= 0 ? String(selectedIndex) : null}
          options={modelOptions}
          onValueChange={value => {
            const entry = modelEntries[Number(value)];
            updateUsage(
              feature.key,
              entry ? { providerId: entry.provider.id, modelName: entry.model.name } : null
            );
          }}
        />
      </SettingRow>
    );
  };

  return (
    <section>
      <h3 className="text-tau-body-lg font-semibold">大语言模型</h3>
      <div className="text-tau-tiny text-ink-3 mt-0.5">
        AI 服务商接入与模型条目管理 · 为各功能分配主力模型
      </div>

      {/* ── 服务商：切换条 + 凭据字段网格 ── */}
      <SectionTitle title={`服务商${llmConfigs.length > 0 ? ` · ${llmConfigs.length}` : ""}`} />
      <div className="flex flex-wrap gap-1.5 pt-1">
        {llmConfigs.map(provider => {
          const active = editing?.id === provider.id;
          return (
            <button
              key={provider.id}
              type="button"
              aria-pressed={active}
              onClick={() => setEditingId(provider.id)}
              className={clsx(
                "text-tau-body flex h-[30px] items-center gap-1.5 rounded-full border pl-1 pr-3",
                "ease-tau-out transition-[background,color,border-color] duration-[160ms]",
                active
                  ? "bg-selected text-ink-1 border-transparent font-semibold"
                  : "border-line-1 text-ink-2 hover:border-ink-3 hover:text-ink-1"
              )}
            >
              <span
                className={clsx(
                  "bg-group text-ink-2 grid size-5 place-items-center rounded-full text-[10px] font-semibold",
                  active && "bg-accent-soft text-accent-text"
                )}
              >
                {provider.name.trim().charAt(0).toUpperCase() || "?"}
              </span>
              {provider.name}
            </button>
          );
        })}
        <button
          type="button"
          onClick={openProviderCreate}
          className="border-line-1 text-ink-3 text-tau-body ease-tau-out hover:border-accent hover:text-accent-text flex h-[30px] items-center gap-1.5 rounded-full border border-dashed px-3 transition-[color,border-color] duration-[160ms]"
        >
          <Plus size={13} strokeWidth={1.75} />
          新建服务商
        </button>
      </div>

      {!editing ? (
        <div className="text-tau-meta text-ink-3 py-6 text-center">
          尚无服务商——点击「新建服务商」填入凭据，再到模型节添加条目
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-x-3 pt-3">
            <label className="flex min-w-0 flex-col gap-1.5">
              <span className="text-tau-meta text-ink-2 font-medium">名称</span>
              <Input
                value={editing.name}
                placeholder="如 DeepSeek"
                onChange={e => updateProviderField("name", e.target.value)}
              />
            </label>
            <label className="flex min-w-0 flex-col gap-1.5">
              <span className="text-tau-meta text-ink-2 font-medium">Base URL</span>
              <Input
                className="font-tau-mono"
                value={editing.baseUrl}
                placeholder="https://api.example.com/v1"
                spellCheck={false}
                onChange={e => updateProviderField("baseUrl", e.target.value)}
              />
            </label>
            <div className="col-span-2 flex min-w-0 flex-col gap-1.5">
              <span className="text-tau-meta text-ink-2 font-medium">API Key</span>
              <div className="flex items-center gap-1.5">
                <Input
                  className="font-tau-mono min-w-0 flex-1"
                  type={showApiKey ? "text" : "password"}
                  value={editing.apiKey}
                  placeholder="sk-…"
                  spellCheck={false}
                  onChange={e => updateProviderField("apiKey", e.target.value)}
                />
                <IconButton
                  aria-label={showApiKey ? "隐藏 API Key" : "显示 API Key"}
                  onClick={() => setShowApiKey(v => !v)}
                >
                  {showApiKey ? (
                    <EyeOff size={14} strokeWidth={1.75} />
                  ) : (
                    <Eye size={14} strokeWidth={1.75} />
                  )}
                </IconButton>
                <IconButton
                  aria-label="复制 API Key"
                  onClick={() => void copyApiKey(editing.apiKey)}
                >
                  <Copy size={14} strokeWidth={1.75} />
                </IconButton>
              </div>
            </div>
          </div>
          <div className="text-tau-tiny text-ink-3 flex items-center gap-2 px-0.5 pt-3">
            <KeyRound size={13} strokeWidth={1.75} className="flex-none" />
            <span className="flex-1">
              点选仅切换「正在编辑哪家」，服务商没有生效状态——各功能用哪个模型在功能分配指定；字段改动即时保存。
            </span>
            <Button
              variant="danger-soft"
              size="sm"
              icon={Trash2}
              onClick={() => setProviderDeleteOpen(true)}
            >
              删除服务商
            </Button>
          </div>

          {/* ── 模型：行流 + 在用计数 ── */}
          <div className="flex items-end justify-between">
            <SectionTitle title={`模型 · ${editing.models.length}`} />
            <Button variant="primary" size="sm" icon={Plus} onClick={openModelCreate}>
              添加模型
            </Button>
          </div>
          {editing.models.length === 0 ? (
            <div className="text-tau-meta text-ink-3 py-5 text-center">
              暂无模型——点击「添加模型」创建第一个条目
            </div>
          ) : (
            editing.models.map(model => {
              const count = usageCount(editing.id, model.name);
              return (
                <div
                  key={model.name}
                  className="border-line-2 group flex items-start gap-3 border-b py-2.5 last:border-b-0"
                >
                  <div className="min-w-0 flex-1">
                    <div className="font-tau-mono text-tau-body text-ink-1 font-medium">
                      {model.name}
                    </div>
                    <div className="text-tau-meta text-ink-2 mt-0.5">{model.description}</div>
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {capabilityLabels(model).map(label => (
                        <CapChip key={label} label={label} />
                      ))}
                      {model.contextWindowK != null && (
                        <MetaChip>上下文 {model.contextWindowK}k</MetaChip>
                      )}
                      {model.maxOutputTokens != null && (
                        <MetaChip>输出 {model.maxOutputTokens}</MetaChip>
                      )}
                      {model.temperature != null && <MetaChip>温度 {model.temperature}</MetaChip>}
                      {model.messageFormat === "claude" && <MetaChip>Claude 格式</MetaChip>}
                      {model.apiProtocol === "responses" && <MetaChip>Responses API</MetaChip>}
                    </div>
                  </div>
                  <span
                    className={clsx(
                      "text-tau-tiny flex flex-none items-center gap-1",
                      count > 0 ? "text-accent-text font-medium" : "text-ink-3"
                    )}
                  >
                    <Link2 size={12} strokeWidth={1.75} />
                    {count > 0 ? `${count} 项功能在用` : "未使用"}
                  </span>
                  <div className="flex flex-none gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                    <IconButton aria-label="编辑模型" onClick={() => openModelEdit(model)}>
                      <Pencil size={14} strokeWidth={1.75} />
                    </IconButton>
                    <IconButton aria-label="删除模型" onClick={() => setModelDelete(model)}>
                      <Trash2 size={14} strokeWidth={1.75} />
                    </IconButton>
                  </div>
                </div>
              );
            })
          )}
        </>
      )}

      {/* ── 功能分配：下划线式分类 tab + 组合选择器 ── */}
      <SectionTitle title="功能分配" desc="各功能独立指定「服务商 · 模型」，未分配的功能不可调用" />
      <div
        className="border-line-1 mt-1 flex gap-0.5 border-b"
        role="tablist"
        aria-label="功能分类"
      >
        {ASSIGNMENT_CATEGORIES.map(cat => {
          const active = cat.label === activeCategory.label;
          return (
            <button
              key={cat.label}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setCategory(cat.label)}
              className={clsx(
                "text-tau-body -mb-px h-[30px] border-b-2 px-3 font-medium",
                "ease-tau-out transition-[color,border-color] duration-[160ms]",
                active
                  ? "border-accent text-ink-1 font-semibold"
                  : "text-ink-2 hover:text-ink-1 border-transparent"
              )}
            >
              {cat.label}
            </button>
          );
        })}
      </div>
      <div className="pt-1">{activeCategory.features.map(renderAssignmentRow)}</div>

      {/* ── 浮层：新建服务商 ── */}
      <Dialog
        open={providerCreateOpen}
        onOpenChange={setProviderCreateOpen}
        onAfterClose={() => setProviderForm({ name: "", baseUrl: "", apiKey: "" })}
        title="新建服务商"
        subtitle="填入名称与凭据，创建后即可添加模型"
        footer={
          <>
            <Button variant="secondary" onClick={() => setProviderCreateOpen(false)}>
              取消
            </Button>
            <Button variant="primary" onClick={submitProviderCreate}>
              创建
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <label className="flex min-w-0 flex-col gap-1.5">
            <span className="text-tau-meta text-ink-2 font-medium">名称</span>
            <Input
              value={providerForm.name}
              placeholder="如 DeepSeek"
              onChange={e => setProviderForm(f => ({ ...f, name: e.target.value }))}
            />
          </label>
          <label className="flex min-w-0 flex-col gap-1.5">
            <span className="text-tau-meta text-ink-2 font-medium">Base URL</span>
            <Input
              className="font-tau-mono"
              value={providerForm.baseUrl}
              placeholder="https://api.example.com/v1"
              spellCheck={false}
              onChange={e => setProviderForm(f => ({ ...f, baseUrl: e.target.value }))}
            />
          </label>
          <label className="flex min-w-0 flex-col gap-1.5">
            <span className="text-tau-meta text-ink-2 font-medium">API Key（可稍后补填）</span>
            <Input
              className="font-tau-mono"
              type="password"
              value={providerForm.apiKey}
              placeholder="sk-…"
              spellCheck={false}
              onChange={e => setProviderForm(f => ({ ...f, apiKey: e.target.value }))}
            />
          </label>
        </div>
      </Dialog>

      {/* ── 浮层：模型编辑表单 ── */}
      <Dialog
        open={modelDialog.open}
        onOpenChange={open => setModelDialog(d => ({ ...d, open }))}
        onAfterClose={() => setModelDialog({ open: false, action: "create" })}
        title={modelDialog.action === "create" ? "添加模型" : "编辑模型"}
        context={editing?.name}
        subtitle="挂在当前服务商下 · 能力与高级参数"
        width={470}
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => setModelDialog(d => ({ ...d, open: false }))}
            >
              取消
            </Button>
            <Button variant="primary" onClick={submitModelForm}>
              保存
            </Button>
          </>
        }
      >
        <div className="grid grid-cols-2 gap-x-3 gap-y-3">
          <label className="flex min-w-0 flex-col gap-1.5">
            <span className="text-tau-meta text-ink-2 font-medium">模型 ID</span>
            <Input
              className="font-tau-mono"
              value={modelForm.name}
              placeholder="如 deepseek-chat"
              spellCheck={false}
              onChange={e => setModelForm(f => ({ ...f, name: e.target.value }))}
            />
          </label>
          <label className="flex min-w-0 flex-col gap-1.5">
            <span className="text-tau-meta text-ink-2 font-medium">描述</span>
            <Input
              value={modelForm.description}
              placeholder="如 高性价比主力"
              onChange={e => setModelForm(f => ({ ...f, description: e.target.value }))}
            />
          </label>
        </div>
        <div className="pt-3">
          <div className="text-tau-meta text-ink-2 pb-1.5 font-medium">能力</div>
          <div className="flex flex-wrap gap-1.5">
            {CAPABILITY_DEFS.map(def => {
              const on = Boolean(modelForm.capabilities[def.key]);
              const Icon = def.icon;
              return (
                <button
                  key={def.key}
                  type="button"
                  aria-pressed={on}
                  onClick={() =>
                    setModelForm(f => ({
                      ...f,
                      capabilities: { ...f.capabilities, [def.key]: !on },
                    }))
                  }
                  className={clsx(
                    "text-tau-meta flex h-[26px] items-center gap-1.5 rounded-full border px-2.5",
                    "ease-tau-out transition-colors duration-[160ms]",
                    on
                      ? "bg-accent-soft text-accent-text border-transparent font-semibold"
                      : "border-line-1 text-ink-2 hover:border-ink-3 hover:text-ink-1"
                  )}
                >
                  <Icon size={12} strokeWidth={1.75} />
                  {def.label}
                </button>
              );
            })}
          </div>
        </div>
        <div className="border-line-1 mt-4 border-t border-dashed pt-1">
          <button
            type="button"
            onClick={() => setAdvancedOpen(v => !v)}
            aria-expanded={advancedOpen}
            className="text-tau-meta text-ink-3 flex w-full items-center gap-1.5 py-1.5 font-semibold"
          >
            <SlidersHorizontal size={13} strokeWidth={1.75} />
            高级参数
            <ChevronDown
              size={13}
              strokeWidth={1.75}
              className={clsx("ease-tau-out transition-transform", advancedOpen && "rotate-180")}
            />
          </button>
          {advancedOpen && (
            <div className="grid grid-cols-2 gap-x-3 gap-y-3 pb-1">
              <label className="flex min-w-0 flex-col gap-1.5">
                <span className="text-tau-meta text-ink-2 font-medium">消息格式</span>
                <Select
                  aria-label="消息格式"
                  className="w-full"
                  value={modelForm.messageFormat}
                  options={[
                    { value: "openai", label: "openai" },
                    { value: "claude", label: "claude" },
                  ]}
                  onValueChange={v =>
                    setModelForm(f => ({
                      ...f,
                      messageFormat: v as ModelFormState["messageFormat"],
                    }))
                  }
                />
              </label>
              <label className="flex min-w-0 flex-col gap-1.5">
                <span className="text-tau-meta text-ink-2 font-medium">API 协议</span>
                <Select
                  aria-label="API 协议"
                  className="w-full"
                  value={modelForm.apiProtocol}
                  disabled={modelForm.messageFormat === "claude"}
                  options={[
                    { value: "chat-completions", label: "chat-completions" },
                    { value: "responses", label: "responses" },
                  ]}
                  onValueChange={v =>
                    setModelForm(f => ({ ...f, apiProtocol: v as ModelFormState["apiProtocol"] }))
                  }
                />
              </label>
              <label className="flex min-w-0 flex-col gap-1.5">
                <span className="text-tau-meta text-ink-2 font-medium">最大输出 tokens</span>
                <Input
                  className="font-tau-mono"
                  value={modelForm.maxOutputTokens}
                  placeholder="仅 claude 格式"
                  disabled={modelForm.messageFormat !== "claude"}
                  spellCheck={false}
                  onChange={e => setModelForm(f => ({ ...f, maxOutputTokens: e.target.value }))}
                />
              </label>
              <label className="flex min-w-0 flex-col gap-1.5">
                <span className="text-tau-meta text-ink-2 font-medium">上下文窗口 (k)</span>
                <Input
                  className="font-tau-mono"
                  value={modelForm.contextWindowK}
                  placeholder="如 64"
                  spellCheck={false}
                  onChange={e => setModelForm(f => ({ ...f, contextWindowK: e.target.value }))}
                />
              </label>
              <label className="flex min-w-0 flex-col gap-1.5">
                <span className="text-tau-meta text-ink-2 font-medium">采样温度</span>
                <Input
                  className="font-tau-mono"
                  value={modelForm.temperature}
                  placeholder="0 – 2"
                  spellCheck={false}
                  onChange={e => setModelForm(f => ({ ...f, temperature: e.target.value }))}
                />
              </label>
              <label className="flex min-w-0 flex-col gap-1.5">
                <span className="text-tau-meta text-ink-2 font-medium">User-Agent</span>
                <Input
                  className="font-tau-mono"
                  value={modelForm.userAgent}
                  placeholder="可选"
                  spellCheck={false}
                  onChange={e => setModelForm(f => ({ ...f, userAgent: e.target.value }))}
                />
              </label>
            </div>
          )}
        </div>
      </Dialog>

      {/* ── 确认：删除服务商 ── */}
      <ConfirmDialog
        open={providerDeleteOpen}
        onOpenChange={setProviderDeleteOpen}
        title="删除服务商"
        context={editing?.name}
        danger
        description={
          editing
            ? `将移除「${editing.name}」及其 ${editing.models.length} 个模型条目。`
            : undefined
        }
        impact={
          affectedByProvider.length > 0
            ? `${affectedByProvider.length} 项功能分配将一并清空：${affectedByProvider
                .map(key => FEATURE_LABELS[key])
                .join("、")}`
            : undefined
        }
        confirmText="删除"
        onConfirm={confirmProviderDelete}
      />

      {/* ── 确认：删除模型 ── */}
      <ConfirmDialog
        open={modelDelete !== null}
        onOpenChange={open => {
          if (!open) setModelDelete(null);
        }}
        title="删除模型"
        context={modelDelete?.name}
        danger
        description={modelDelete ? `将从「${editing?.name}」移除该模型条目。` : undefined}
        impact={
          affectedByModel.length > 0
            ? `${affectedByModel.length} 项功能分配将一并清空：${affectedByModel
                .map(key => FEATURE_LABELS[key])
                .join("、")}`
            : undefined
        }
        confirmText="删除"
        onConfirm={confirmModelDelete}
      />
    </section>
  );
}
