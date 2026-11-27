/**
 * 大语言模型 —— AI 服务商接入与各功能的主力模型分配。
 *
 * 页内两个 Tab：
 * - 服务商与模型：顶部 ProviderSwitcher 切换「正在编辑哪家」（服务商没有「当前/生效」语义，
 *   不同于同步/图床的 active），下方整宽分组「连接」（凭据设置行）+「模型」（分隔行：名称与
 *   能力/参数签同行、在用计数与编辑删除常驻右侧，增删改走浮层表单）；
 * - 功能分配：按分类分组面板，每行一个组合选择器（searchable Select 按服务商分组，
 *   选项行 = 模型名 + 能力角标，取代 legacy 两级下拉）；Tab 角标 = 未分配功能数。删除服务商/模型时一并清空引用它们的分配槽位，
 * 模型改名时分配引用跟随——legacy 均会留悬空引用。
 */

import { llmText, llmValue, useLlmSettingsI18n } from "./llm.i18n";
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
  SettingRow,
  ROW_DIVIDER,
  Button,
  ConfirmDialog,
  Dialog,
  DialogBody,
  IconButton,
  Input,
  Select,
  Switch,
  toast,
} from "@tau/ui";
import { INLINE_SUGGESTION_SLOT } from "@/types/inline-suggestions";
import useSettingStore, { type ISetting } from "@/stores/useSettingStore";
import type {
  LLMModelSetting,
  LLMProviderSetting,
  LLMUsageConfigV2,
  PiThinkingLevel,
} from "@/types/pi-llm";
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
import { useCatalogModels, useCatalogProviders, useThinkingLevels } from "@/services/llmCatalog";
import { ToolPermissionGroup } from "./ToolPermissionGroup";
import { AgentShellGroup } from "./AgentShellGroup";
import { AgentWorkspaceGroup } from "./AgentWorkspaceGroup";
import { ModelUsagePanel } from "./ModelUsagePanel";
import {
  ContentInsightsDescription,
  ContentMetadataDescription,
  ContentMetadataProgressRow,
} from "./ContentMetadataStatus";

type FeatureKey = keyof ISetting["llmUsageSettings"];

interface FeatureDef {
  key: FeatureKey;
  label: string;
  desc: ReactNode;
}

const ASSIGNMENT_CATEGORIES: Array<{ label: string; features: FeatureDef[] }> = [
  {
    get label() {
      return llmText("ui.chatWriting");
    },
    features: [
      {
        key: "chat",
        get label() {
          return llmText("ui.chat");
        },
        get desc() {
          return llmText("ui.mainModelForChatAndWriting");
        },
      },
      {
        key: INLINE_SUGGESTION_SLOT,
        get label() {
          return llmText("ui.inlineSuggestions");
        },
        get desc() {
          return llmText("ui.completeTextAndCodeAssigningAModel");
        },
      },
    ],
  },
  {
    get label() {
      return llmText("ui.contentProcessing");
    },
    features: [
      {
        key: "titleSummary",
        get label() {
          return llmText("ui.titleSummaries");
        },
        get desc() {
          return llmText("ui.summarizeNotesAndDocumentsForTitles");
        },
      },
      {
        key: "webClip",
        get label() {
          return llmText("ui.webClipping");
        },
        get desc() {
          return llmText("ui.extractAndCleanClippedWebPages");
        },
      },
      {
        key: "assistantMemory",
        get label() {
          return llmText("ui.assistantMemory");
        },
        get desc() {
          return llmText("ui.maintainRecentContextAndLastingPreferencesFrom");
        },
      },
      {
        key: "contentMetadata",
        get label() {
          return llmText("ui.noteMetadata");
        },
        desc: <ContentMetadataDescription />,
      },
      {
        key: "contentInsights",
        get label() {
          return llmText("ui.aiInsights");
        },
        desc: <ContentInsightsDescription />,
      },
    ],
  },
  {
    get label() {
      return llmText("ui.media");
    },
    features: [
      {
        key: "videoSummary",
        get label() {
          return llmText("ui.videoSummaries");
        },
        get desc() {
          return llmText("ui.organizeVideoNotesIntoChaptersAndSummarize");
        },
      },
      {
        key: "videoEbookRewrite",
        get label() {
          return llmText("ui.videoToEbook");
        },
        get desc() {
          return llmText("ui.rewriteVideoContentAsEbookChapters");
        },
      },
      {
        key: "transcriptionOptimization",
        get label() {
          return llmText("ui.transcriptCleanup");
        },
        get desc() {
          return llmText("ui.improveSentenceBreaksAndFlowInTranscripts");
        },
      },
      {
        key: "speechInputRefinement",
        get label() {
          return llmText("ui.voiceInputCleanup");
        },
        get desc() {
          return llmText("ui.addPunctuationAndCleanUpRecognizedSpeech");
        },
      },
    ],
  },
  {
    get label() {
      return llmText("ui.learning");
    },
    features: [
      {
        key: "flashcardGeneration",
        get label() {
          return llmText("ui.flashcards");
        },
        get desc() {
          return llmText("ui.createFlashcardsAndEvaluateShortAnswers");
        },
      },
      {
        key: "vibeLearningImageDescription",
        get label() {
          return llmText("ui.imageUnderstanding");
        },
        get desc() {
          return llmText("ui.describeNotebookImagesUsingAModelThat");
        },
      },
    ],
  },
];

const assignmentFeatureLabel = (key: FeatureKey) =>
  ASSIGNMENT_CATEGORIES.flatMap(category => category.features).find(feature => feature.key === key)
    ?.label ?? key;

/** 推理档位的界面文案：与输入框的档位选择同一套说法，不暴露内部档位名 */
const THINKING_LEVEL_LABELS: Record<PiThinkingLevel, string> = {
  get off() {
    return llmText("ui.noReasoning");
  },
  get minimal() {
    return llmText("ui.minimalReasoning");
  },
  get low() {
    return llmText("ui.lightReasoning");
  },
  get medium() {
    return llmText("ui.detailedReasoning");
  },
  get high() {
    return llmText("ui.deepReasoning");
  },
  get xhigh() {
    return llmText("ui.extensiveReasoning");
  },
  get max() {
    return llmText("ui.maximumReasoning");
  },
};

/** 能力 = 模型支持的推理开关 + 输入模态（图片）；联网/音视频等不再作为模型能力标注 */
const CAPABILITY_DEFS: Array<{ key: string; label: string; icon: LucideIcon }> = [
  {
    key: "reasoning",
    get label() {
      return llmText("ui.reasoning");
    },
    icon: Sparkle,
  },
  {
    key: "image",
    get label() {
      return llmText("ui.images");
    },
    icon: ImageIcon,
  },
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
  {
    key: "costInput",
    get label() {
      return llmText("ui.input");
    },
  },
  {
    key: "costOutput",
    get label() {
      return llmText("ui.output");
    },
  },
  {
    key: "costCacheRead",
    get label() {
      return llmText("ui.cacheRead");
    },
  },
  {
    key: "costCacheWrite",
    get label() {
      return llmText("ui.cacheWrite");
    },
  },
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

const isPositiveInt = (value: number | undefined): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value > 0;

function parsePositiveInt(text: string): number | undefined {
  const trimmed = text.trim();
  if (!trimmed) return undefined;
  const value = Number(trimmed);
  return Number.isSafeInteger(value) && value > 0 ? value : undefined;
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
  missingCapacity,
  onEdit,
  onDelete,
}: {
  model: LLMModelSetting;
  usage: number;
  missingCapacity: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  useLlmSettingsI18n();

  const label = model.name || model.id;
  const description = model.name && model.name !== model.id ? model.id : undefined;
  return (
    <div
      className={clsx(
        "rounded-tau-sm flex min-h-[52px] items-center gap-3 px-3 py-2.5",
        ROW_DIVIDER
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="font-tau-mono text-ink-1 mr-0.5 text-[12.5px] font-medium">{label}</span>
          {missingCapacity && (
            <button
              type="button"
              onClick={onEdit}
              className="bg-warn-soft text-warn text-tau-tiny rounded-full px-2 leading-[17px] font-medium transition-opacity hover:opacity-80"
            >
              {llmText("ui.capacityRequired")}
            </button>
          )}
          {capabilityLabels(model).map(capLabel => (
            <CapChip key={capLabel} label={capLabel} />
          ))}
          {model.contextWindow != null && (
            <MetaChip>
              {llmText("ui.context")} {Math.round(model.contextWindow / 1024)}k
            </MetaChip>
          )}
          {model.maxTokens != null && (
            <MetaChip>
              {llmText("ui.output")} {model.maxTokens}
            </MetaChip>
          )}
          {model.cost && (
            <MetaChip>
              {formatCost(model.cost)} {llmText("ui.million")}
            </MetaChip>
          )}
          {model.stripThinkTags && <MetaChip>{llmText("ui.clearReasoningContent")}</MetaChip>}
        </div>
        {description && (
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
        {usage > 0
          ? llmText("message.usedByFeatures", { count: llmValue(usage) })
          : llmText("ui.notInUse")}
      </span>
      <div className="flex flex-none gap-0.5">
        <IconButton
          aria-label={llmText("message.editModel", { name: llmValue(label) })}
          onClick={onEdit}
        >
          <Pencil size={14} strokeWidth={1.75} />
        </IconButton>
        <IconButton
          aria-label={llmText("message.deleteModel", { name: llmValue(label) })}
          onClick={onDelete}
        >
          <Trash2 size={14} strokeWidth={1.75} />
        </IconButton>
      </div>
    </div>
  );
}

function CapChip({ label }: { label: string }) {
  return (
    <span className="bg-hover text-ink-2 text-tau-tiny rounded-full px-2 leading-[17px] font-medium">
      {label}
    </span>
  );
}

function MetaChip({ children }: { children: ReactNode }) {
  return (
    <span className="border-line-1 text-ink-3 font-tau-mono text-tau-tiny rounded-full border px-2 leading-[17px] tabular-nums">
      {children}
    </span>
  );
}

/** 功能分配行：模型选择 + 思考档位选择（reasoning 模型专属，inlineSuggestion 不显示） */
function AssignmentRow({
  feature,
  usage,
  modelEntries,
  modelOptions,
  updateUsage,
}: {
  feature: FeatureDef;
  usage: LLMUsageConfigV2 | null;
  modelEntries: { provider: LLMProviderSetting; model: LLMModelSetting }[];
  modelOptions: {
    value: string;
    group: string | undefined;
    label: ReactNode;
    searchText: string;
  }[];
  updateUsage: (feature: FeatureKey, config: LLMUsageConfigV2 | null) => void;
}) {
  useLlmSettingsI18n();

  const selectedIndex = usage
    ? modelEntries.findIndex(
        entry => entry.provider.id === usage.providerId && entry.model.id === usage.modelId
      )
    : -1;
  const selectedEntry = selectedIndex >= 0 ? modelEntries[selectedIndex] : null;

  // inlineSuggestion 始终不思考（8 秒超时、单行 JSON，思考有害无益）
  const showThinking =
    feature.key !== INLINE_SUGGESTION_SLOT && Boolean(selectedEntry?.model.reasoning);
  const { levels: thinkingLevels } = useThinkingLevels(
    selectedEntry?.provider,
    selectedEntry?.model.id ?? ""
  );
  const thinkingOptions = useMemo(
    () => [
      {
        value: "",
        get label() {
          return llmText("ui.defaultFollowModel");
        },
      },
      ...thinkingLevels.map(level => ({
        value: level,
        get label() {
          return THINKING_LEVEL_LABELS[level];
        },
      })),
    ],
    [thinkingLevels]
  );

  return (
    <SettingRow title={feature.label} description={feature.desc}>
      <div className="flex items-center gap-2">
        <Select
          aria-label={llmText("message.modelFor", { feature: llmValue(feature.label) })}
          className="w-[250px]"
          searchable
          placeholder={llmText("ui.unassigned")}
          emptyText={llmText("ui.noModelsAddOneAboveFirst")}
          value={selectedIndex >= 0 ? String(selectedIndex) : null}
          options={[
            {
              value: "off",
              get label() {
                return llmText("ui.clearAssignmentDoNotUseAI");
              },
            },
            ...modelOptions,
          ]}
          onValueChange={value => {
            const entry =
              value == null || value === "off" ? undefined : modelEntries[Number(value)];
            updateUsage(
              feature.key,
              entry ? { providerId: entry.provider.id, modelId: entry.model.id } : null
            );
          }}
        />
        {showThinking && (
          <Select
            aria-label={llmText("message.reasoningLevelFor", { feature: llmValue(feature.label) })}
            className="w-[148px]"
            placeholder={llmText("ui.defaultFollowModel")}
            value={usage?.thinkingLevel ?? ""}
            options={thinkingOptions}
            onValueChange={value => {
              if (!selectedEntry) return;
              updateUsage(feature.key, {
                providerId: selectedEntry.provider.id,
                modelId: selectedEntry.model.id,
                ...(value ? { thinkingLevel: value as PiThinkingLevel } : {}),
              });
            }}
          />
        )}
      </div>
    </SettingRow>
  );
}

/** 组合选择器的选项行：模型名 + 能力角标（供应商由分组头承担，行保持短；触发器回填同 label） */
function ModelOptionLabel({ model }: { model: LLMModelSetting }) {
  useLlmSettingsI18n();
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
  useLlmSettingsI18n();

  const llmConfigs = useSettingStore(s => s.setting.llmProviders);
  const llmUsageSettings = useSettingStore(s => s.setting.llmUsageSettings);
  const updateUsage = useSettingStore(s => s.updateLLMUsageSetting);
  const compactionPercent = useSettingStore(s => s.setting.chatCompactionPercent ?? null);
  const inlineSuggestionShared = useSettingStore(s => s.setting.inlineSuggestionShared);

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
      toast.info(llmText("ui.apiKeyIsEmpty"));
      return;
    }
    try {
      await navigator.clipboard.writeText(key);
      toast.success(llmText("ui.apiKeyCopiedToClipboard"));
    } catch {
      toast.error(llmText("ui.couldNotCopyPleaseTryAgain"));
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

  // 内置目录元数据（显式 builtin 优先，否则按官方 baseUrl 匹配，与主进程 resolveBuiltinId 一致）
  const { providers: catalogProviders } = useCatalogProviders();
  const effectiveBuiltin = useMemo(() => {
    if (!editing) return undefined;
    if (editing.builtin) return editing.builtin;
    const normalized = editing.baseUrl.trim().replace(/\/+$/, "").toLowerCase();
    if (!normalized) return undefined;
    return catalogProviders.find(
      provider =>
        provider.baseUrl && provider.baseUrl.replace(/\/+$/, "").toLowerCase() === normalized
    )?.id;
  }, [editing, catalogProviders]);
  const { models: catalogModels, loading: catalogLoading } = useCatalogModels(effectiveBuiltin);
  const catalogModelOf = (modelId: string) => catalogModels.find(model => model.id === modelId);
  const catalogCostOf = (modelId: string) => catalogModelOf(modelId)?.cost;
  const isModelMissingCapacity = (model: LLMModelSetting) =>
    !catalogModelOf(model.id) &&
    (!isPositiveInt(model.contextWindow) || !isPositiveInt(model.maxTokens));

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
    const missingCapacityCount = catalogLoading
      ? 0
      : change.add.filter(model => isModelMissingCapacity(model)).length;
    const summary = [
      change.add.length > 0
        ? llmText("message.addedModels", { count: llmValue(change.add.length) })
        : "",
      change.remove.length > 0
        ? llmText("message.removed", { count: llmValue(change.remove.length) })
        : "",
      missingCapacityCount > 0
        ? llmText("message.addedModelsNeedCapacity", { count: llmValue(missingCapacityCount) })
        : "",
    ]
      .filter(Boolean)
      .join(llmText("format.summarySeparator"));
    if (summary) {
      if (missingCapacityCount > 0) toast.warning(summary);
      else toast.success(summary);
    }
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
      {
        value: "",
        get label() {
          return llmText("ui.automaticModelDefault");
        },
      },
      ...thinking.levels.map(level => ({
        value: level,
        get label() {
          return THINKING_LEVEL_LABELS[level];
        },
      })),
    ],
    [thinking.levels]
  );
  const thinkingHint = !modelForm.reasoning
    ? llmText("ui.thisModelDoesNotSupportReasoning")
    : thinking.loading
      ? llmText("ui.loading")
      : thinking.fromCatalog
        ? ""
        : llmText("ui.unrecognizedModelReasoningLevelsMayNotTake");

  const formCatalogModel = catalogModelOf(modelForm.id.trim());
  const formCatalogCost = formCatalogModel?.cost;

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
      toast.warning(llmText("ui.enterAModelID"));
      return;
    }
    const duplicate =
      modelDialog.action === "create"
        ? editing.models.some(m => m.id === id)
        : modelForm.initialId !== id && editing.models.some(m => m.id === id);
    if (duplicate) {
      toast.warning(llmText("ui.thisProviderAlreadyHasAModelWith"));
      return;
    }
    const rawContext = modelForm.contextWindow.trim();
    const rawMaxTokens = modelForm.maxTokens.trim();
    const parsedContext = parsePositiveInt(rawContext);
    const parsedMaxTokens = parsePositiveInt(rawMaxTokens);
    if (rawContext !== "" && parsedContext === undefined) {
      toast.warning(llmText("ui.contextWindowMustBePositiveInteger"));
      return;
    }
    if (rawMaxTokens !== "" && parsedMaxTokens === undefined) {
      toast.warning(llmText("ui.maxTokensMustBePositiveInteger"));
      return;
    }
    const catalogMatch = catalogModelOf(id);
    if (
      !catalogLoading &&
      !catalogMatch &&
      (parsedContext === undefined || parsedMaxTokens === undefined)
    ) {
      toast.warning(llmText("ui.enterContextWindowAndMaxTokens"));
      return;
    }
    const parsedTemperature = Number.parseFloat(modelForm.temperature);
    const displayName = modelForm.displayName.trim();
    const hasCostInput = modelForm.costInput.trim() !== "" || modelForm.costOutput.trim() !== "";
    const cost = parseCostForm(modelForm);
    if (hasCostInput && !cost) {
      toast.warning(llmText("ui.enterBothInputAndOutputPricesAs"));
      return;
    }
    // 单价留空时用目录价填入（手填的目录模型也一样），之后可改
    const catalogCost = !hasCostInput && !cost ? catalogMatch?.cost : undefined;
    const next: LLMModelSetting = {
      id,
      ...(displayName && displayName !== id ? { name: displayName } : {}),
      reasoning: modelForm.reasoning,
      input: modelForm.image ? ["text", "image"] : ["text"],
      ...(parsedContext !== undefined ? { contextWindow: parsedContext } : {}),
      ...(parsedMaxTokens !== undefined ? { maxTokens: parsedMaxTokens } : {}),
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
      ...(cost ? { cost } : catalogCost ? { cost: { ...catalogCost } } : {}),
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
  const tab = useSettingsStore(state => state.llmTab);
  const setTab = (llmTab: "providers" | "assignment" | "permission" | "usage") =>
    useSettingsStore.setState({ llmTab });
  const unassignedCount = ASSIGNMENT_CATEGORIES.flatMap(category => category.features).filter(
    feature => !llmUsageSettings[feature.key]
  ).length;

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
    return (
      <AssignmentRow
        key={feature.key}
        feature={feature}
        usage={usage ?? null}
        modelEntries={modelEntries}
        modelOptions={modelOptions}
        updateUsage={updateUsage}
      />
    );
  };

  return (
    <>
      <SettingsTabs
        label={llmText("ui.languageModelSettingsView")}
        value={tab}
        onChange={setTab}
        items={[
          {
            key: "providers",
            get label() {
              return llmText("ui.providersModels");
            },
          },
          {
            key: "assignment",
            get label() {
              return llmText("ui.featureAssignments");
            },
            badge: unassignedCount || undefined,
          },
          {
            key: "permission",
            get label() {
              return llmText("ui.toolPermissions");
            },
          },
          {
            key: "usage",
            get label() {
              return llmText("ui.usage");
            },
          },
        ]}
      />

      {tab === "providers" ? (
        <SettingsGroup>
          <ProviderSwitcher
            label={llmText("ui.languageModelProviders")}
            items={llmConfigs.map(provider => ({
              id: provider.id,
              label: provider.name || llmText("ui.untitled"),
              meta: provider.models.length,
            }))}
            activeId={editing?.id}
            onSelect={setEditingId}
            addLabel={llmText("ui.addProvider")}
            onAdd={() => setProviderCreateOpen(true)}
          />
          {!editing ? (
            <div className="text-tau-meta text-ink-2 px-3 py-8 text-center">
              {llmText("ui.noProvidersYetChooseAddProviderEnter")}
            </div>
          ) : (
            <>
              <ProviderSection
                title={llmText("ui.connection")}
                description={llmText("message.nameAndCredentialsFor", {
                  name: llmValue(editing.name || llmText("ui.untitled")),
                })}
                action={
                  <Button
                    variant="ghost"
                    size="sm"
                    icon={Trash2}
                    onClick={() => setProviderDeleteOpen(true)}
                  >
                    {llmText("ui.deleteProvider")}
                  </Button>
                }
              >
                <SettingRow title={llmText("ui.name")}>
                  <FieldBox>
                    <Input
                      value={editing.name}
                      placeholder={llmText("ui.forExampleDeepSeek")}
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
                <SettingRow
                  title="Base URL"
                  description={llmText("ui.apiAddressSuppliedByTheProvider")}
                >
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
                title={llmText("ui.models")}
                description={llmText("message.modelsAssignThemInFeatureAssignments", {
                  count: llmValue(editing.models.length),
                })}
                action={
                  <>
                    {/* 勾选优先：内置服务商带预设元数据，其他服务商向服务商实时获取 */}
                    <Button
                      variant="ghost"
                      size="sm"
                      icon={Sparkles}
                      disabled={!editing.baseUrl.trim()}
                      title={editing.baseUrl.trim() ? undefined : llmText("ui.enterABaseURLFirst")}
                      onClick={() => setModelPickerOpen(true)}
                    >
                      {llmText("ui.chooseModels")}
                    </Button>
                    <Button variant="ghost" size="sm" icon={Plus} onClick={openModelCreate}>
                      {llmText("ui.addManually")}
                    </Button>
                  </>
                }
              >
                {editing.models.length === 0 ? (
                  <div className="text-tau-meta text-ink-2 px-3 py-6 text-center">
                    {llmText("ui.noModelsYetUseChooseModelsOr")}
                  </div>
                ) : (
                  editing.models.map(model => (
                    <ModelRow
                      key={model.id}
                      model={model}
                      usage={usageCount(editing.id, model.id)}
                      missingCapacity={!catalogLoading && isModelMissingCapacity(model)}
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
            {cat.features.some(feature => feature.key === "chat") && (
              <SettingRow
                title={llmText("ui.automaticCompactionThreshold")}
                description={llmText("ui.compactOlderMessagesWhenChatContextExceeds")}
              >
                <div className="flex items-center gap-2">
                  <Input
                    wrapperClassName="w-24"
                    key={compactionPercent ?? "default"}
                    aria-label={llmText("ui.automaticCompactionThreshold2")}
                    type="number"
                    min={1}
                    max={99}
                    step={1}
                    defaultValue={compactionPercent ?? ""}
                    placeholder={llmText("ui.default")}
                    onKeyDown={event => {
                      if (event.key === "Enter") event.currentTarget.blur();
                    }}
                    onBlur={event => {
                      const field = event.currentTarget;
                      if (!field.validity.valid) {
                        toast.warning(llmText("ui.enterAnIntegerFrom1To99"));
                        field.value = String(compactionPercent ?? "");
                        return;
                      }
                      const value = field.value === "" ? null : field.valueAsNumber;
                      if (value !== compactionPercent)
                        useSettingStore.setState(state => ({
                          setting: { ...state.setting, chatCompactionPercent: value },
                        }));
                    }}
                  />
                  <span aria-hidden="true">%</span>
                </div>
              </SettingRow>
            )}
            {cat.features.some(feature => feature.key === INLINE_SUGGESTION_SLOT) && (
              <SettingRow
                title={llmText("ui.inlineSuggestionsInSharedContent")}
                description={llmText("ui.allowSendingTextNearTheCursorIn")}
              >
                <Switch
                  aria-label={llmText("ui.inlineSuggestionsInSharedContent")}
                  checked={inlineSuggestionShared}
                  onCheckedChange={value =>
                    useSettingStore.setState(state => ({
                      setting: { ...state.setting, inlineSuggestionShared: value },
                    }))
                  }
                />
              </SettingRow>
            )}
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
        title={modelDialog.action === "create" ? llmText("ui.addModel") : llmText("ui.editModel")}
        context={editing?.name}
        subtitle={llmText("ui.forTheCurrentProviderCapabilitiesAdvancedParameters")}
        width={470}
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => setModelDialog(d => ({ ...d, open: false }))}
            >
              {llmText("ui.cancel")}
            </Button>
            <Button variant="primary" onClick={submitModelForm}>
              {llmText("ui.save")}
            </Button>
          </>
        }
      >
        <DialogBody>
          <div className="grid grid-cols-2 gap-x-3 gap-y-3">
            <label className="flex min-w-0 flex-col gap-1.5">
              <span className="text-tau-meta text-ink-2 font-medium">{llmText("ui.modelID")}</span>
              <Input
                className="font-tau-mono"
                value={modelForm.id}
                placeholder={llmText("ui.forExampleDeepseekChatTheProviderS")}
                spellCheck={false}
                onChange={e => setModelForm(f => ({ ...f, id: e.target.value }))}
              />
            </label>
            <label className="flex min-w-0 flex-col gap-1.5">
              <span className="text-tau-meta text-ink-2 font-medium">
                {llmText("ui.displayNameOptional")}
              </span>
              <Input
                value={modelForm.displayName}
                placeholder={llmText("ui.forExampleEverydayModel")}
                onChange={e => setModelForm(f => ({ ...f, displayName: e.target.value }))}
              />
            </label>
          </div>
          <div className="pt-3">
            <div className="text-tau-meta text-ink-2 pb-1.5 font-medium">
              {llmText("ui.capacity")}
              <span className="text-ink-3 ml-1 font-normal">
                {formCatalogModel
                  ? llmText("message.catalogCapacityAppliedLeaveBlankToUse", {
                      contextWindow: llmValue(formCatalogModel.contextWindow),
                      maxTokens: llmValue(formCatalogModel.maxTokens),
                    })
                  : llmText("ui.requiredEnterValuesFromYourProvider")}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-x-3">
              <label className="flex min-w-0 flex-col gap-1">
                <span className="text-tau-tiny text-ink-3">
                  {llmText("ui.contextWindowTokens")}
                </span>
                <Input
                  className="font-tau-mono"
                  inputMode="numeric"
                  aria-label={llmText("ui.contextWindowTokens")}
                  value={modelForm.contextWindow}
                  placeholder={
                    formCatalogModel
                      ? String(formCatalogModel.contextWindow)
                      : llmText("ui.forExample128000")
                  }
                  spellCheck={false}
                  onChange={e => setModelForm(f => ({ ...f, contextWindow: e.target.value }))}
                />
              </label>
              <label className="flex min-w-0 flex-col gap-1">
                <span className="text-tau-tiny text-ink-3">
                  {llmText("ui.maximumOutputTokens")}
                </span>
                <Input
                  className="font-tau-mono"
                  inputMode="numeric"
                  aria-label={llmText("ui.maximumOutputTokens")}
                  value={modelForm.maxTokens}
                  placeholder={
                    formCatalogModel
                      ? String(formCatalogModel.maxTokens)
                      : llmText("ui.forExample8192")
                  }
                  spellCheck={false}
                  onChange={e => setModelForm(f => ({ ...f, maxTokens: e.target.value }))}
                />
              </label>
            </div>
          </div>
          <div className="pt-3">
            <div className="text-tau-meta text-ink-2 pb-1.5 font-medium">
              {llmText("ui.capabilities")}
            </div>
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
              {llmText("ui.priceUSDMillionTokens")}
              <span className="text-ink-3 ml-1 font-normal">
                {formCatalogCost
                  ? llmText("message.catalogPriceAppliedAdjustItToYour", {
                      price: llmValue(formatCost(formCatalogCost)),
                    })
                  : llmText("ui.noCatalogPriceEnterPricesToEstimate")}
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
                      aria-label={llmText("message.price", { field: llmValue(field.label) })}
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
              {llmText("ui.advancedParameters")}
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
                    {llmText("ui.reasoningLevel")}
                    {thinkingHint && (
                      <span className="text-ink-3 ml-1 font-normal">{thinkingHint}</span>
                    )}
                  </span>
                  <Select
                    aria-label={llmText("ui.reasoningLevel")}
                    className="w-full"
                    value={modelForm.thinkingLevel}
                    disabled={!modelForm.reasoning}
                    options={thinkingOptions}
                    onValueChange={v => setModelForm(f => ({ ...f, thinkingLevel: v }))}
                  />
                </label>
                <label className="flex min-w-0 flex-col gap-1.5">
                  <span className="text-tau-meta text-ink-2 font-medium">
                    {llmText("ui.temperature")}
                  </span>
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
                    placeholder={llmText("ui.optional")}
                    spellCheck={false}
                    onChange={e => setModelForm(f => ({ ...f, userAgent: e.target.value }))}
                  />
                </label>
                <label className="flex min-w-0 flex-col gap-1.5">
                  <span className="text-tau-meta text-ink-2 font-medium">
                    {llmText("ui.reasoningContent")}
                  </span>
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
                    {llmText("ui.automaticallyRemoveReasoningContentFromAnswers")}
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
        title={llmText("ui.deleteProvider")}
        context={editing?.name}
        danger
        description={
          editing
            ? llmText("message.removeAndItsModelEntries", {
                name: llmValue(editing.name),
                count: llmValue(editing.models.length),
              })
            : undefined
        }
        impact={
          affectedByProvider.length > 0
            ? llmText("message.featureAssignmentsWillAlsoBeCleared", {
                count: llmValue(affectedByProvider.length),
                features: llmValue(
                  affectedByProvider
                    .map(key => assignmentFeatureLabel(key))
                    .join(llmText("format.listSeparator"))
                ),
              })
            : undefined
        }
        confirmText={llmText("ui.delete")}
        onConfirm={confirmProviderDelete}
      />

      {/* ── 确认：删除模型 ── */}
      <ConfirmDialog
        open={modelDelete !== null}
        onOpenChange={open => {
          if (!open) setModelDelete(null);
        }}
        title={llmText("ui.deleteModel")}
        context={modelDelete ? modelDelete.name || modelDelete.id : undefined}
        danger
        description={
          modelDelete
            ? llmText("message.removeThisModelEntryFrom", { name: llmValue(editing?.name) })
            : undefined
        }
        impact={
          affectedByModel.length > 0
            ? llmText("message.featureAssignmentsWillAlsoBeCleared", {
                count: llmValue(affectedByModel.length),
                features: llmValue(
                  affectedByModel
                    .map(key => assignmentFeatureLabel(key))
                    .join(llmText("format.listSeparator"))
                ),
              })
            : undefined
        }
        confirmText={llmText("ui.delete")}
        onConfirm={confirmModelDelete}
      />
    </>
  );
}
import { useSettingsStore } from "@/app/settingsStore";
