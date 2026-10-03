/**
 * 大语言模型 —— AI 服务商接入与各功能的主力模型分配（llm-designs.html 案 1 定稿）。
 *
 * 页内两个 Tab（2026-09-24 第三版重排）：
 * - 服务商与模型：顶部 ProviderSwitcher 切换「正在编辑哪家」（服务商没有「当前/生效」语义，
 *   不同于同步/图床的 active），下方整宽分组「连接」（凭据设置行）+「模型」（分隔行：名称与
 *   能力/参数签同行、在用计数与编辑删除常驻右侧，增删改走浮层表单）——provider-layout.html 方案 A；
 * - 功能分配：按分类分组面板，每行一个组合选择器（searchable Select 按服务商分组，
 *   选项行 = 模型名 + 能力角标，取代 legacy 两级下拉）；Tab 角标 = 未分配功能数。删除服务商/模型时一并清空引用它们的分配槽位，
 * 模型改名时分配引用跟随——legacy 均会留悬空引用。
 */

import { useMemo, useState, type ReactNode } from "react";
import clsx from "clsx";
import { produce } from "immer";
import { v4 as uuidv4 } from "uuid";
import {
  ChevronDown,
  Image as ImageIcon,
  Link2,
  Pencil,
  Plus,
  SlidersHorizontal,
  Sparkle,
  Sparkles,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import {
  Button,
  ConfirmDialog,
  Dialog,
  DialogBody,
  IconButton,
  Input,
  Select,
  toast,
} from "@tau/ui";
import useSettingStore, { type ISetting } from "@/stores/useSettingStore";
import type {
  LLMModelSetting,
  LLMProviderSetting,
  LLMUsageConfigV2,
  PiThinkingLevel,
} from "@/types/pi-llm";
import { SettingRow } from "../components/SettingRow";
import { ROW_DIVIDER } from "../components/rowDivider";
import { SettingsGroup } from "../components/SettingsGroup";
import {
  FieldBox,
  ProviderSection,
  ProviderSwitcher,
  SecretInput,
} from "../components/ProviderLayout";
import { SettingsTabs } from "../components/SettingsTabs";
import { ProviderCreateDialog, type NewProviderDraft } from "../components/ProviderCreateDialog";
import { ModelPickerDialog } from "../components/ModelPickerDialog";
import { useCatalogModels, useThinkingLevels } from "@/services/llmCatalog";
import { ToolPermissionGroup } from "./ToolPermissionGroup";
import { AgentShellGroup } from "./AgentShellGroup";
import { AgentWorkspaceGroup } from "./AgentWorkspaceGroup";
import { ModelUsagePanel } from "./ModelUsagePanel";
import { ContentMetadataDescription, ContentMetadataProgressRow } from "./ContentMetadataStatus";

type FeatureKey = keyof ISetting["llmUsageSettings"];

interface FeatureDef {
  key: FeatureKey;
  label: string;
  desc: ReactNode;
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
      { key: "contentMetadata", label: "笔记元信息", desc: <ContentMetadataDescription /> },
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

/** 推理档位的界面文案：与输入框的档位选择同一套说法，不暴露内部档位名 */
const THINKING_LEVEL_LABELS: Record<PiThinkingLevel, string> = {
  off: "不思考",
  minimal: "极简思考",
  low: "略作沉吟",
  medium: "细致推演",
  high: "穷尽求索",
  xhigh: "远谋深算",
  max: "极尽推演",
};

/** 能力 = 模型支持的推理开关 + 输入模态（图片）；联网/音视频等不再作为模型能力标注 */
const CAPABILITY_DEFS: Array<{ key: string; label: string; icon: LucideIcon }> = [
  { key: "reasoning", label: "推理", icon: Sparkle },
  { key: "image", label: "图片", icon: ImageIcon },
];

function hasCapability(model: LLMModelSetting, key: string): boolean {
  if (key === "reasoning") return model.reasoning;
  return model.input.includes("image");
}

function capabilityLabels(model: LLMModelSetting): string[] {
  return CAPABILITY_DEFS.filter(def => hasCapability(model, def.key)).map(def => def.label);
}

/** 引用命中的功能槽位清单（删除保护的提示来源） */
function featuresUsing(
  usageSettings: Record<string, LLMUsageConfigV2 | null>,
  match: (usage: LLMUsageConfigV2) => boolean
): FeatureKey[] {
  return (Object.keys(usageSettings) as FeatureKey[]).filter(key => {
    const usage = usageSettings[key];
    return usage !== null && match(usage);
  });
}

interface ModelFormState {
  id: string;
  displayName: string;
  reasoning: boolean;
  image: boolean;
  /** 推理档位，空 = 交给 pi 按模型能力取默认 */
  thinkingLevel: string;
  stripThinkTags: boolean;
  contextWindow: string;
  maxTokens: string;
  temperature: string;
  userAgent: string;
  /** 单价（美元 / 百万 tokens）；输入与输出都填才生效，缓存可空 */
  costInput: string;
  costOutput: string;
  costCacheRead: string;
  costCacheWrite: string;
  /** 编辑态按旧模型 ID 定位（支持改名） */
  initialId: string;
}

const COST_FIELDS = [
  { key: "costInput", label: "输入" },
  { key: "costOutput", label: "输出" },
  { key: "costCacheRead", label: "缓存读取" },
  { key: "costCacheWrite", label: "缓存写入" },
] as const;

const costToText = (value: number | undefined) => (value === undefined ? "" : String(value));

/** 表单单价 → 设置；输入、输出任一无效则视为未设置（回落目录价格） */
function parseCostForm(form: ModelFormState): LLMModelSetting["cost"] {
  const rate = (text: string) => {
    if (text.trim() === "") return undefined;
    const value = Number(text);
    return Number.isFinite(value) && value >= 0 ? value : undefined;
  };
  const input = rate(form.costInput);
  const output = rate(form.costOutput);
  if (input === undefined || output === undefined) return undefined;
  const cacheRead = rate(form.costCacheRead);
  const cacheWrite = rate(form.costCacheWrite);
  return {
    input,
    output,
    ...(cacheRead !== undefined ? { cacheRead } : {}),
    ...(cacheWrite !== undefined ? { cacheWrite } : {}),
  };
}

/** 单价展示：$输入/$输出 每百万 tokens */
const formatCost = (cost: NonNullable<LLMModelSetting["cost"]>) => `$${cost.input}/$${cost.output}`;

function blankModelForm(): ModelFormState {
  return {
    id: "",
    displayName: "",
    reasoning: false,
    image: false,
    thinkingLevel: "",
    stripThinkTags: false,
    contextWindow: "",
    maxTokens: "",
    temperature: "",
    userAgent: "",
    costInput: "",
    costOutput: "",
    costCacheRead: "",
    costCacheWrite: "",
    initialId: "",
  };
}

/** 编辑表单初值：单价取设置里的值（目录价会被主进程自动填入）；尚未填入时临时用目录价 */
function modelToForm(
  model: LLMModelSetting,
  catalogCost?: LLMModelSetting["cost"]
): ModelFormState {
  const cost = model.cost ?? catalogCost;
  return {
    costInput: costToText(cost?.input),
    costOutput: costToText(cost?.output),
    costCacheRead: costToText(cost?.cacheRead),
    costCacheWrite: costToText(cost?.cacheWrite),
    id: model.id,
    displayName: model.name && model.name !== model.id ? model.name : "",
    reasoning: model.reasoning,
    image: model.input.includes("image"),
    thinkingLevel: model.thinkingLevel ?? "",
    stripThinkTags: model.stripThinkTags === true,
    contextWindow: String(model.contextWindow ?? ""),
    maxTokens: String(model.maxTokens ?? ""),
    temperature:
      typeof model.samplingParams?.temperature === "number"
        ? String(model.samplingParams.temperature)
        : "",
    userAgent: model.headers?.["User-Agent"] ?? "",
    initialId: model.id,
  };
}

/** 模型行：名称与能力 / 参数签同一行，描述与名称不同才显示；在用计数与编辑 / 删除常驻右侧 */
function ModelRow({
  model,
  usage,
  onEdit,
  onDelete,
}: {
  model: LLMModelSetting;
  usage: number;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const description = model.name && model.name !== model.id ? model.name.trim() : undefined;
  return (
    <div
      className={clsx(
        "rounded-tau-sm flex min-h-[52px] items-center gap-3 px-3 py-2.5",
        ROW_DIVIDER
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="font-tau-mono text-ink-1 mr-0.5 text-[12.5px] font-medium">
            {model.name}
          </span>
          {capabilityLabels(model).map(label => (
            <CapChip key={label} label={label} />
          ))}
          {model.contextWindow != null && (
            <MetaChip>上下文 {Math.round(model.contextWindow / 1024)}k</MetaChip>
          )}
          {model.maxTokens != null && <MetaChip>输出 {model.maxTokens}</MetaChip>}
          {model.cost && <MetaChip>{formatCost(model.cost)} /百万</MetaChip>}
          {model.stripThinkTags && <MetaChip>清除思考内容</MetaChip>}
        </div>
        {description && description !== model.name && (
          <div className="text-tau-meta text-ink-2 mt-0.5 truncate">{description}</div>
        )}
      </div>
      <span
        className={clsx(
          "text-tau-sm flex flex-none items-center gap-1 tabular-nums",
          usage > 0 ? "text-ink-2" : "text-ink-3"
        )}
      >
        <Link2 size={12} strokeWidth={1.75} />
        {usage > 0 ? `${usage} 项功能在用` : "未使用"}
      </span>
      <div className="flex flex-none gap-0.5">
        <IconButton aria-label={`编辑模型 ${model.name}`} onClick={onEdit}>
          <Pencil size={14} strokeWidth={1.75} />
        </IconButton>
        <IconButton aria-label={`删除模型 ${model.name}`} onClick={onDelete}>
          <Trash2 size={14} strokeWidth={1.75} />
        </IconButton>
      </div>
    </div>
  );
}

function CapChip({ label }: { label: string }) {
  return (
    <span className="bg-hover text-ink-2 text-tau-tiny rounded-full px-2 font-medium leading-[17px]">
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
function ModelOptionLabel({ model }: { model: LLMModelSetting }) {
  const caps = capabilityLabels(model);
  return (
    <span className="flex min-w-0 items-baseline gap-1.5">
      <span className="font-tau-mono truncate">{model.id}</span>
      {caps.length > 0 && (
        <span className="text-tau-tiny text-ink-3 flex-none">{caps.join(" · ")}</span>
      )}
    </span>
  );
}

export function LLMSection() {
  const llmConfigs = useSettingStore(s => s.setting.llmProviders);
  const llmUsageSettings = useSettingStore(s => s.setting.llmUsageSettings);
  const updateUsage = useSettingStore(s => s.updateLLMUsageSetting);

  /* ── 切换条：editingId 失效时回落第一家 ── */
  const [editingId, setEditingId] = useState<string | null>(null);
  const editing = llmConfigs.find(p => p.id === editingId) ?? llmConfigs[0];

  const mutateProviders = (fn: (providers: LLMProviderSetting[]) => void) => {
    useSettingStore.setState(s => ({
      setting: produce(s.setting, draft => fn(draft.llmProviders)),
    }));
  };

  /**
   * 服务商/模型与分配槽位一起改：**一次用户操作只能产生一次设置写入**。
   * 拆成两次会广播出「槽位已清、服务商还在」这样的中间态，多窗口互相回灌时旧快照可能
   * 盖回新状态，表现为删掉的服务商又冒出来（见交接文档坑 16）。
   */
  const mutateProvidersAndUsage = (
    fn: (providers: LLMProviderSetting[], slots: Record<string, LLMUsageConfigV2 | null>) => void
  ) => {
    useSettingStore.setState(s => ({
      setting: produce(s.setting, draft =>
        fn(draft.llmProviders, draft.llmUsageSettings as Record<string, LLMUsageConfigV2 | null>)
      ),
    }));
  };

  const mutateUsage = (fn: (slots: Record<string, LLMUsageConfigV2 | null>) => void) => {
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

  /* ── 新建服务商（先选内置目录 / 自定义，见 ProviderCreateDialog） ── */
  const [providerCreateOpen, setProviderCreateOpen] = useState(false);

  const submitProviderCreate = (draft: NewProviderDraft) => {
    const id = uuidv4();
    mutateProviders(providers => {
      providers.push({ id, ...draft, models: [] });
    });
    setEditingId(id);
  };

  /* ── 勾选模型（内置服务商带预设目录；所有服务商都可向服务商实时获取，手填表单兜底） ── */
  const [modelPickerOpen, setModelPickerOpen] = useState(false);

  const applyModelPick = (change: { add: LLMModelSetting[]; remove: string[] }) => {
    if (!editing) return;
    const providerId = editing.id;
    mutateProvidersAndUsage((providers, slots) => {
      const target = providers.find(p => p.id === providerId);
      if (!target) return;
      target.models = target.models.filter(model => !change.remove.includes(model.id));
      target.models.push(...change.add);
      // 移除模型要一并清掉引用它的分配槽位，否则留悬空引用
      for (const [key, usage] of Object.entries(slots)) {
        if (usage?.providerId === providerId && change.remove.includes(usage.modelId)) {
          slots[key] = null;
        }
      }
    });
    const summary = [
      change.add.length > 0 ? `新增 ${change.add.length} 个模型` : "",
      change.remove.length > 0 ? `移除 ${change.remove.length} 个` : "",
    ]
      .filter(Boolean)
      .join("，");
    if (summary) toast.success(summary);
  };

  /* ── 删除服务商（确认弹层，引用槽位一并清空） ── */
  const [providerDeleteOpen, setProviderDeleteOpen] = useState(false);
  const affectedByProvider = editing
    ? featuresUsing(llmUsageSettings, usage => usage.providerId === editing.id)
    : [];

  const confirmProviderDelete = () => {
    if (!editing) return;
    const id = editing.id;
    mutateProvidersAndUsage((providers, slots) => {
      const index = providers.findIndex(p => p.id === id);
      if (index !== -1) providers.splice(index, 1);
      // 清掉引用它的分配槽位（含被删服务商的任意模型），与删除同一次写入
      for (const [key, usage] of Object.entries(slots)) {
        if (usage?.providerId === id) slots[key] = null;
      }
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
  const [modelDelete, setModelDelete] = useState<LLMModelSetting | null>(null);

  // 推理档位按该模型真实能力生成（pi getSupportedThinkingLevels）：静态七项会给出模型不支持的档位
  const thinking = useThinkingLevels(editing, modelForm.initialId || modelForm.id);
  const thinkingOptions = useMemo(
    () => [
      { value: "", label: "自动（跟随模型默认）" },
      ...thinking.levels.map(level => ({ value: level, label: THINKING_LEVEL_LABELS[level] })),
    ],
    [thinking.levels]
  );
  const thinkingHint = !modelForm.reasoning
    ? "（该模型不支持推理）"
    : thinking.loading
      ? "（加载中…）"
      : thinking.fromCatalog
        ? ""
        : "（未能识别此模型，档位可能不生效）";

  // 目录价格：编辑时作单价默认值与占位提示（目录外服务商为空）
  const { models: catalogModels } = useCatalogModels(editing?.builtin);
  const catalogCostOf = (modelId: string) =>
    catalogModels.find(model => model.id === modelId)?.cost;
  const formCatalogCost = catalogCostOf(modelForm.initialId || modelForm.id.trim());

  const openModelCreate = () => {
    setModelForm(blankModelForm());
    setAdvancedOpen(false);
    setModelDialog({ open: true, action: "create" });
  };

  const openModelEdit = (model: LLMModelSetting) => {
    setModelForm(modelToForm(model, catalogCostOf(model.id)));
    setAdvancedOpen(
      Boolean(
        model.headers?.["User-Agent"] ||
        model.samplingParams?.temperature !== undefined ||
        model.stripThinkTags ||
        model.thinkingLevel
      )
    );
    setModelDialog({ open: true, action: "edit" });
  };

  const submitModelForm = () => {
    if (!editing) return;
    const id = modelForm.id.trim();
    if (!id) {
      toast.warning("请填写模型 ID");
      return;
    }
    const duplicate =
      modelDialog.action === "create"
        ? editing.models.some(m => m.id === id)
        : modelForm.initialId !== id && editing.models.some(m => m.id === id);
    if (duplicate) {
      toast.warning("该服务商下已存在同名模型");
      return;
    }
    const parsedMaxTokens = Number.parseInt(modelForm.maxTokens, 10);
    const parsedContext = Number.parseInt(modelForm.contextWindow, 10);
    const parsedTemperature = Number.parseFloat(modelForm.temperature);
    const displayName = modelForm.displayName.trim();
    const hasCostInput = modelForm.costInput.trim() !== "" || modelForm.costOutput.trim() !== "";
    const cost = parseCostForm(modelForm);
    if (hasCostInput && !cost) {
      toast.warning("单价需同时填写输入和输出，且为非负数");
      return;
    }
    const next: LLMModelSetting = {
      id,
      ...(displayName && displayName !== id ? { name: displayName } : {}),
      reasoning: modelForm.reasoning,
      input: modelForm.image ? ["text", "image"] : ["text"],
      ...(Number.isFinite(parsedContext) && parsedContext > 0
        ? { contextWindow: parsedContext }
        : {}),
      ...(Number.isFinite(parsedMaxTokens) && parsedMaxTokens > 0
        ? { maxTokens: parsedMaxTokens }
        : {}),
      ...(modelForm.thinkingLevel
        ? { thinkingLevel: modelForm.thinkingLevel as LLMModelSetting["thinkingLevel"] }
        : {}),
      ...(modelForm.stripThinkTags ? { stripThinkTags: true } : {}),
      ...(Number.isFinite(parsedTemperature) && parsedTemperature >= 0
        ? { samplingParams: { temperature: parsedTemperature } }
        : {}),
      ...(modelForm.userAgent.trim()
        ? { headers: { "User-Agent": modelForm.userAgent.trim() } }
        : {}),
      // 单价留空时用目录价填入（手填的目录模型也一样），之后可改
      ...(cost
        ? { cost }
        : !hasCostInput && catalogCostOf(id)
          ? { cost: { ...catalogCostOf(id)! } }
          : {}),
    };
    const providerId = editing.id;
    const initialId = modelForm.initialId;
    mutateProviders(providers => {
      const provider = providers.find(p => p.id === providerId);
      if (!provider) return;
      if (modelDialog.action === "create") {
        provider.models.push(next);
      } else {
        const index = provider.models.findIndex(m => m.id === initialId);
        if (index !== -1) provider.models[index] = next;
      }
    });
    // 改名后引用旧名的分配槽位跟随
    if (modelDialog.action === "edit" && initialId !== id) {
      mutateUsage(slots => {
        (Object.keys(slots) as FeatureKey[]).forEach(key => {
          const usage = slots[key];
          if (usage && usage.providerId === providerId && usage.modelId === initialId) {
            usage.modelId = id;
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
          usage => usage.providerId === editing.id && usage.modelId === modelDelete.id
        )
      : [];

  const confirmModelDelete = () => {
    if (!editing || !modelDelete) return;
    const providerId = editing.id;
    const modelId = modelDelete.id;
    mutateProvidersAndUsage((providers, slots) => {
      const provider = providers.find(p => p.id === providerId);
      if (provider) provider.models = provider.models.filter(m => m.id !== modelId);
      for (const [key, usage] of Object.entries(slots)) {
        if (usage?.providerId === providerId && usage.modelId === modelId) slots[key] = null;
      }
    });
    setModelDelete(null);
  };

  const usageCount = (providerId: string, modelId: string) =>
    featuresUsing(
      llmUsageSettings,
      usage => usage.providerId === providerId && usage.modelId === modelId
    ).length;

  /* ── 页内 Tab：服务商与模型 / 功能分配 ── */
  const [tab, setTab] = useState<"providers" | "assignment" | "permission" | "usage">("providers");
  const unassignedCount = Object.values(llmUsageSettings).filter(usage => usage === null).length;

  /** 全部 (服务商, 模型) 平铺；选项 value 为下标，选择时反查成 providerId + modelId */
  const modelEntries = useMemo(
    () => llmConfigs.flatMap(provider => provider.models.map(model => ({ provider, model }))),
    [llmConfigs]
  );

  const modelOptions = modelEntries.map((entry, index) => ({
    value: String(index),
    group: entry.provider.name,
    label: <ModelOptionLabel model={entry.model} />,
    searchText: `${entry.provider.name} ${entry.model.id} ${entry.model.name ?? ""} ${capabilityLabels(entry.model).join(" ")}`,
  }));

  const renderAssignmentRow = (feature: FeatureDef) => {
    const usage = llmUsageSettings[feature.key];
    const selectedIndex = usage
      ? modelEntries.findIndex(
          entry => entry.provider.id === usage.providerId && entry.model.id === usage.modelId
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
              entry ? { providerId: entry.provider.id, modelId: entry.model.id } : null
            );
          }}
        />
      </SettingRow>
    );
  };

  return (
    <>
      <SettingsTabs
        label="大语言模型视图"
        value={tab}
        onChange={setTab}
        items={[
          { key: "providers", label: "服务商与模型" },
          { key: "assignment", label: "功能分配", badge: unassignedCount || undefined },
          { key: "permission", label: "工具权限" },
          { key: "usage", label: "用量统计" },
        ]}
      />

      {tab === "providers" ? (
        <SettingsGroup>
          <ProviderSwitcher
            label="大语言模型服务商"
            items={llmConfigs.map(provider => ({
              id: provider.id,
              label: provider.name || "未命名",
              meta: provider.models.length,
            }))}
            activeId={editing?.id}
            onSelect={setEditingId}
            addLabel="添加服务商"
            onAdd={() => setProviderCreateOpen(true)}
          />
          {!editing ? (
            <div className="text-tau-meta text-ink-2 px-3 py-8 text-center">
              还没有服务商——点击「添加服务商」填入凭据，再添加模型
            </div>
          ) : (
            <>
              <ProviderSection
                title="连接"
                description={`${editing.name || "未命名"} 的名称与凭据`}
                action={
                  <Button
                    variant="ghost"
                    size="sm"
                    icon={Trash2}
                    onClick={() => setProviderDeleteOpen(true)}
                  >
                    删除服务商
                  </Button>
                }
              >
                <SettingRow title="名称">
                  <FieldBox>
                    <Input
                      value={editing.name}
                      placeholder="如 DeepSeek"
                      onChange={e => updateProviderField("name", e.target.value)}
                    />
                  </FieldBox>
                </SettingRow>
                <SettingRow title="API Key">
                  <FieldBox>
                    <SecretInput
                      label="API Key"
                      value={editing.apiKey}
                      placeholder="sk-…"
                      onChange={value => updateProviderField("apiKey", value)}
                      onCopy={() => void copyApiKey(editing.apiKey)}
                    />
                  </FieldBox>
                </SettingRow>
                <SettingRow title="Base URL" description="服务商提供的接口地址">
                  <FieldBox>
                    <Input
                      className="font-tau-mono"
                      value={editing.baseUrl}
                      placeholder="https://api.example.com/v1"
                      spellCheck={false}
                      onChange={e => updateProviderField("baseUrl", e.target.value)}
                    />
                  </FieldBox>
                </SettingRow>
              </ProviderSection>

              <ProviderSection
                title="模型"
                description={`${editing.models.length} 个 · 在「功能分配」中指定给各项功能`}
                action={
                  <>
                    {/* 勾选优先：内置服务商带预设元数据，其他服务商向服务商实时获取 */}
                    <Button
                      variant="ghost"
                      size="sm"
                      icon={Sparkles}
                      disabled={!editing.baseUrl.trim()}
                      title={editing.baseUrl.trim() ? undefined : "请先填写 Base URL"}
                      onClick={() => setModelPickerOpen(true)}
                    >
                      选择模型
                    </Button>
                    <Button variant="ghost" size="sm" icon={Plus} onClick={openModelCreate}>
                      手动添加
                    </Button>
                  </>
                }
              >
                {editing.models.length === 0 ? (
                  <div className="text-tau-meta text-ink-2 px-3 py-6 text-center">
                    暂无模型——点击「选择模型」勾选要使用的模型，列表里没有的可「手动添加」
                  </div>
                ) : (
                  editing.models.map(model => (
                    <ModelRow
                      key={model.id}
                      model={model}
                      usage={usageCount(editing.id, model.id)}
                      onEdit={() => openModelEdit(model)}
                      onDelete={() => setModelDelete(model)}
                    />
                  ))
                )}
              </ProviderSection>
            </>
          )}
        </SettingsGroup>
      ) : tab === "permission" ? (
        <>
          <ToolPermissionGroup />
          <AgentWorkspaceGroup />
          <AgentShellGroup />
        </>
      ) : tab === "usage" ? (
        <ModelUsagePanel />
      ) : (
        ASSIGNMENT_CATEGORIES.map(cat => (
          <SettingsGroup key={cat.label} title={cat.label}>
            {cat.features.map(renderAssignmentRow)}
            {cat.features.some(feature => feature.key === "contentMetadata") && (
              <ContentMetadataProgressRow />
            )}
          </SettingsGroup>
        ))
      )}

      {/* ── 浮层：新建服务商（内置目录 / 自定义） ── */}
      <ProviderCreateDialog
        open={providerCreateOpen}
        onOpenChange={setProviderCreateOpen}
        onCreate={submitProviderCreate}
      />

      {/* ── 浮层：勾选模型（预设目录 + 向服务商实时获取） ── */}
      {editing && (
        <ModelPickerDialog
          open={modelPickerOpen}
          onOpenChange={setModelPickerOpen}
          provider={editing}
          onConfirm={applyModelPick}
        />
      )}

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
        <DialogBody>
          <div className="grid grid-cols-2 gap-x-3 gap-y-3">
            <label className="flex min-w-0 flex-col gap-1.5">
              <span className="text-tau-meta text-ink-2 font-medium">模型 ID</span>
              <Input
                className="font-tau-mono"
                value={modelForm.id}
                placeholder="如 deepseek-chat（服务商给出的模型 ID）"
                spellCheck={false}
                onChange={e => setModelForm(f => ({ ...f, id: e.target.value }))}
              />
            </label>
            <label className="flex min-w-0 flex-col gap-1.5">
              <span className="text-tau-meta text-ink-2 font-medium">展示名（可选）</span>
              <Input
                value={modelForm.displayName}
                placeholder="如 高性价比主力"
                onChange={e => setModelForm(f => ({ ...f, displayName: e.target.value }))}
              />
            </label>
          </div>
          <div className="pt-3">
            <div className="text-tau-meta text-ink-2 pb-1.5 font-medium">能力</div>
            <div className="flex flex-wrap gap-1.5">
              {CAPABILITY_DEFS.map(def => {
                const on = def.key === "reasoning" ? modelForm.reasoning : modelForm.image;
                const Icon = def.icon;
                return (
                  <button
                    key={def.key}
                    type="button"
                    aria-pressed={on}
                    onClick={() =>
                      setModelForm(f =>
                        def.key === "reasoning" ? { ...f, reasoning: !on } : { ...f, image: !on }
                      )
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
          <div className="pt-3">
            <div className="text-tau-meta text-ink-2 pb-1.5 font-medium">
              单价（美元 / 百万 tokens）
              <span className="text-ink-3 ml-1 font-normal">
                {formCatalogCost
                  ? `已按目录价 ${formatCost(formCatalogCost)} 填入，可按实际改`
                  : "目录未收录价格，填写后用于用量统计估算费用"}
              </span>
            </div>
            <div className="grid grid-cols-4 gap-2">
              {COST_FIELDS.map(field => {
                const catalogValue =
                  formCatalogCost?.[
                    field.key === "costInput"
                      ? "input"
                      : field.key === "costOutput"
                        ? "output"
                        : field.key === "costCacheRead"
                          ? "cacheRead"
                          : "cacheWrite"
                  ];
                return (
                  <label key={field.key} className="flex min-w-0 flex-col gap-1">
                    <span className="text-tau-tiny text-ink-3">{field.label}</span>
                    <Input
                      className="font-tau-mono"
                      inputMode="decimal"
                      aria-label={`${field.label}单价`}
                      value={modelForm[field.key]}
                      placeholder={catalogValue !== undefined ? String(catalogValue) : "0"}
                      spellCheck={false}
                      onChange={e => setModelForm(f => ({ ...f, [field.key]: e.target.value }))}
                    />
                  </label>
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
                  <span className="text-tau-meta text-ink-2 font-medium">
                    推理档位
                    {thinkingHint && (
                      <span className="text-ink-3 ml-1 font-normal">{thinkingHint}</span>
                    )}
                  </span>
                  <Select
                    aria-label="推理档位"
                    className="w-full"
                    value={modelForm.thinkingLevel}
                    disabled={!modelForm.reasoning}
                    options={thinkingOptions}
                    onValueChange={v => setModelForm(f => ({ ...f, thinkingLevel: v }))}
                  />
                </label>
                <label className="flex min-w-0 flex-col gap-1.5">
                  <span className="text-tau-meta text-ink-2 font-medium">上下文窗口 (tokens)</span>
                  <Input
                    className="font-tau-mono"
                    value={modelForm.contextWindow}
                    placeholder="如 65536"
                    spellCheck={false}
                    onChange={e => setModelForm(f => ({ ...f, contextWindow: e.target.value }))}
                  />
                </label>
                <label className="flex min-w-0 flex-col gap-1.5">
                  <span className="text-tau-meta text-ink-2 font-medium">最大输出 tokens</span>
                  <Input
                    className="font-tau-mono"
                    value={modelForm.maxTokens}
                    placeholder="如 8192"
                    spellCheck={false}
                    onChange={e => setModelForm(f => ({ ...f, maxTokens: e.target.value }))}
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
                <label className="flex min-w-0 flex-col gap-1.5">
                  <span className="text-tau-meta text-ink-2 font-medium">思考内容处理</span>
                  <button
                    type="button"
                    aria-pressed={modelForm.stripThinkTags}
                    onClick={() => setModelForm(f => ({ ...f, stripThinkTags: !f.stripThinkTags }))}
                    className={clsx(
                      "text-tau-meta rounded-tau-sm flex h-[30px] items-center gap-1.5 border px-2.5",
                      "ease-tau-out transition-colors duration-[160ms]",
                      modelForm.stripThinkTags
                        ? "bg-accent-soft text-accent-text border-transparent font-semibold"
                        : "border-line-1 text-ink-2 hover:border-ink-3 hover:text-ink-1"
                    )}
                  >
                    自动清除回答里的思考内容
                  </button>
                </label>
              </div>
            )}
          </div>
        </DialogBody>
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
    </>
  );
}
