// AI 服务商详情：账号（Key、地址）、测试连接、模型启用与手填。
// 新增时是未保存的草稿，点「保存」才写入设置；返回有未保存修改时先确认。

import { useMemo, useRef, useState } from "react";
import { CircleAlert, CircleCheck, LoaderCircle, Plus, Trash2 } from "lucide-react";
import { PortalScope } from "@tau/ui";
import { ActionSheet } from "../../../components/ActionSheet";
import { GroupLabel } from "../../../components/GroupLabel";
import { MobileConfirmDialog } from "../../../components/MobileConfirmDialog";
import { PageHeader, PageHeaderTextButton } from "../../../components/PageHeader";
import { toast } from "../../../components/toast";
import { useEdgeFade } from "../../../hooks/useScrollState";
import { useNavigator } from "../../../router";
import { LLM_FEATURES, modelLabel } from "../../../services/ai-settings";
import type { MobileLlmProvider } from "../../../types";
import { GroupCard, GroupNote, GroupRow, SwitchButton } from "../components/ui";
import { useDiscardGuard } from "../storage/providerPage";
import { AiBadge, ModelCapabilities } from "./AiUi";
import { CustomModelSheet } from "./CustomModelSheet";
import { catalogModels, draftProvider, modelFromCatalog } from "./catalog";
import { ChoiceField, TextField } from "./fields";
import {
  API_OPTIONS,
  formatTokens,
  sameDraft,
  validateDraft,
  type ModelSetting,
  type ProviderDraft,
} from "./providerDraft";
import { useAiSettings } from "./useAiSettings";

type TestState =
  | { status: "running" }
  | { status: "ok"; ms: number }
  | { status: "error"; message: string }
  | null;

const loadMobileAi = () =>
  import("../../../services/ai").then(module => module.getMobileAiService());

export function AiProviderPage(props: { providerId: string; preset?: string }) {
  const navigator = useNavigator();
  const { providers, usage, mutate, databaseName } = useAiSettings();
  const saved = providers.find(item => item.id === props.providerId);
  const initial = useMemo<ProviderDraft | null>(() => {
    const provider = saved ?? (props.preset ? draftProvider(props.preset, props.providerId) : null);
    return provider ? { provider: structuredClone(provider), apiKey: "" } : null;
    // 只在进入页面时取初值，保存后的快照通过 baseline 更新
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.providerId]);
  const [baseline, setBaseline] = useState(initial);
  const [draft, setDraft] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<ReturnType<typeof validateDraft>>({});
  const [test, setTest] = useState<TestState>(null);
  const [apiPicker, setApiPicker] = useState(false);
  const [customOpen, setCustomOpen] = useState(false);
  const [removeOpen, setRemoveOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  useEdgeFade(scrollRef, { bottom: false });
  const isNew = !saved;
  const dirty = !!draft && !!baseline && (isNew || !sameDraft(draft, baseline));
  const guard = useDiscardGuard(dirty && !saving, () => setDraft(baseline));

  if (!draft) {
    return (
      <div className="mobile-kb-screen bg-page fixed inset-0 z-50 flex flex-col">
        <PageHeader title="服务商" onBack={() => void navigator.goBack("ui")} />
        <p className="text-ink-3 text-tau-meta px-8 py-16 text-center">
          服务商不存在，可能已被删除。
        </p>
      </div>
    );
  }

  const { provider } = draft;
  const catalog = catalogModels(provider.builtin);
  const enabledIds = new Set(provider.models.map(model => model.id));
  const extraModels = provider.models.filter(model => !catalog.some(item => item.id === model.id));
  const usedBy = (modelId: string) =>
    LLM_FEATURES.filter(
      feature =>
        usage[feature.key]?.providerId === provider.id && usage[feature.key]?.modelId === modelId
    );
  const patch = (next: Partial<MobileLlmProvider>) =>
    setDraft(current => current && { ...current, provider: { ...current.provider, ...next } });
  const setModels = (models: ModelSetting[]) => patch({ models });
  const toggleCatalogModel = (id: string) => {
    if (enabledIds.has(id)) return setModels(provider.models.filter(model => model.id !== id));
    const model = catalog.find(item => item.id === id);
    if (model) setModels([...provider.models, modelFromCatalog(model)]);
  };

  const save = async () => {
    const nextErrors = validateDraft(draft);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return false;
    setSaving(true);
    try {
      const apiKey = draft.apiKey.trim();
      const next = {
        ...provider,
        name: provider.name.trim(),
        baseUrl: provider.baseUrl.trim(),
      };
      delete next.configured;
      delete next.keyHint;
      const snapshot = await mutate({
        kind: "upsertProvider",
        provider: next,
        ...(apiKey ? { apiKey } : {}),
      });
      const stored = snapshot.llmProviders.find(item => item.id === provider.id);
      if (stored) {
        const fresh = { provider: structuredClone(stored), apiKey: "" };
        setBaseline(fresh);
        setDraft(fresh);
      }
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "保存失败");
      return false;
    } finally {
      setSaving(false);
    }
  };

  const runTest = async () => {
    const model = provider.models[0];
    if (!model) return setErrors({ models: "至少保留一个模型" });
    if (dirty && !(await save())) return;
    setTest({ status: "running" });
    const started = performance.now();
    try {
      const service = await loadMobileAi();
      const result = await service.models.verify(databaseName, {
        providerId: provider.id,
        modelId: model.id,
      });
      setTest(
        result.ok
          ? { status: "ok", ms: Math.round(performance.now() - started) }
          : { status: "error", message: result.error?.message ?? "模型没有正常回复" }
      );
    } catch (error) {
      setTest({ status: "error", message: error instanceof Error ? error.message : "连接失败" });
    }
  };

  const remove = async () => {
    try {
      await mutate({ kind: "removeProvider", providerId: provider.id });
      setRemoveOpen(false);
      void navigator.goBackBypassed("ui");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "删除失败");
    }
  };

  const keyPlaceholder = saved?.configured
    ? `已保存 · …${saved.keyHint || "****"}，留空不修改`
    : "粘贴 API Key";
  const apiLabel = API_OPTIONS.find(option => option.value === provider.api)?.label ?? provider.api;

  return (
    <PortalScope>
      <div className="mobile-kb-screen bg-page fixed inset-0 z-50 flex flex-col">
        <PageHeader
          title={provider.name || "自定义服务"}
          onBack={guard.request}
          actions={
            <PageHeaderTextButton disabled={!dirty || saving} onClick={() => void save()}>
              {saving ? "保存中" : "保存"}
            </PageHeaderTextButton>
          }
        />
        <div
          ref={scrollRef}
          className="edge-fade-scroll mobile-page-scroll flex-1 overflow-y-auto px-4"
        >
          <div className="page-enter space-y-1">
            <GroupLabel>账号</GroupLabel>
            <GroupCard>
              {!provider.builtin && (
                <TextField
                  label="名称"
                  value={provider.name}
                  placeholder="例如：公司网关"
                  error={errors.name}
                  onChange={name => patch({ name })}
                />
              )}
              <TextField
                label="API Key"
                secret
                value={draft.apiKey}
                placeholder={keyPlaceholder}
                onChange={apiKey => setDraft({ ...draft, apiKey })}
              />
              <TextField
                label="接口地址"
                inputMode="url"
                value={provider.baseUrl}
                placeholder="https://api.example.com/v1"
                error={errors.baseUrl}
                onChange={baseUrl => patch({ baseUrl })}
              />
              {!provider.builtin && (
                <ChoiceField label="协议" value={apiLabel} onClick={() => setApiPicker(true)} />
              )}
            </GroupCard>
            {saved?.configured && (
              <GroupNote>Key 已保存在本机。要更换时粘贴新 Key 并保存。</GroupNote>
            )}

            <div className="flex px-1 pt-3">
              <button
                type="button"
                disabled={test?.status === "running" || saving}
                onClick={() => void runTest()}
                className="bg-surface text-ink-1 shadow-card text-tau-meta flex h-10 items-center gap-2 rounded-xl px-4 font-semibold disabled:opacity-50"
              >
                {test?.status === "running" && (
                  <LoaderCircle size={15} className="animate-spin" aria-hidden="true" />
                )}
                {dirty ? "保存并测试连接" : "测试连接"}
              </button>
            </div>
            {test && test.status !== "running" && (
              <p
                role="status"
                className={`text-tau-sm flex items-start gap-1.5 px-[15px] pt-2 ${
                  test.status === "ok" ? "text-tag-1" : "text-danger"
                }`}
              >
                {test.status === "ok" ? (
                  <CircleCheck size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
                ) : (
                  <CircleAlert size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
                )}
                {test.status === "ok"
                  ? `连接成功 · ${(test.ms / 1000).toFixed(1)} 秒`
                  : test.message}
              </p>
            )}

            <GroupLabel tone={errors.models ? "warn" : "ink"}>{errors.models ?? "模型"}</GroupLabel>
            <GroupCard>
              {catalog.map(model => (
                <GroupRow key={model.id}>
                  <span className="min-w-0 flex-1">
                    <span className="text-ink-1 text-tau-body flex items-center font-medium">
                      <span className="truncate">{model.name || model.id}</span>
                      <ModelCapabilities model={model} />
                      {usedBy(model.id).map(feature => (
                        <AiBadge key={feature.key} tone="muted">
                          {feature.label}
                        </AiBadge>
                      ))}
                    </span>
                    <span className="text-ink-3 text-tau-sm block truncate">
                      {model.id} · {formatTokens(model.contextWindow)} 上下文
                    </span>
                  </span>
                  <SwitchButton
                    checked={enabledIds.has(model.id)}
                    onChange={() => toggleCatalogModel(model.id)}
                  />
                </GroupRow>
              ))}
              {extraModels.map(model => (
                <GroupRow key={model.id}>
                  <span className="min-w-0 flex-1">
                    <span className="text-ink-1 text-tau-body flex items-center font-medium">
                      <span className="truncate">{modelLabel(model)}</span>
                      <ModelCapabilities model={model} />
                      {usedBy(model.id).map(feature => (
                        <AiBadge key={feature.key} tone="muted">
                          {feature.label}
                        </AiBadge>
                      ))}
                    </span>
                    <span className="text-ink-3 text-tau-sm block truncate">
                      {model.id}
                      {model.contextWindow ? ` · ${formatTokens(model.contextWindow)} 上下文` : ""}
                    </span>
                  </span>
                  <button
                    type="button"
                    aria-label={`移除 ${modelLabel(model)}`}
                    className="text-ink-3 -mr-1 grid h-9 w-9 shrink-0 place-items-center"
                    onClick={() => setModels(provider.models.filter(item => item.id !== model.id))}
                  >
                    <Trash2 size={17} aria-hidden="true" />
                  </button>
                </GroupRow>
              ))}
              <GroupRow onClick={() => setCustomOpen(true)}>
                <Plus size={18} className="text-accent-text shrink-0" aria-hidden="true" />
                <span className="text-accent-text text-tau-body flex-1 font-medium">
                  手动添加模型
                </span>
              </GroupRow>
            </GroupCard>
            <GroupNote>关闭的模型不会出现在功能分配里。</GroupNote>

            {saved && (
              <div className="pt-5">
                <GroupCard>
                  <GroupRow onClick={() => setRemoveOpen(true)}>
                    <span className="text-danger text-tau-body flex-1 text-center font-medium">
                      删除服务商
                    </span>
                  </GroupRow>
                </GroupCard>
              </div>
            )}
          </div>
        </div>
        {guard.sheet}
        <ActionSheet
          open={apiPicker}
          title="协议"
          items={API_OPTIONS.map(option => ({
            label: option.label,
            selected: option.value === provider.api,
            onClick: () => patch({ api: option.value }),
          }))}
          onClose={() => setApiPicker(false)}
        />
        <CustomModelSheet
          open={customOpen}
          existingIds={enabledIds}
          onClose={() => setCustomOpen(false)}
          onAdd={model => {
            setModels([...provider.models, model]);
            setCustomOpen(false);
          }}
        />
        <MobileConfirmDialog
          open={removeOpen}
          title={`删除「${provider.name}」？`}
          description="API Key 与模型清单会一起删除，使用它的功能分配会被清空。"
          confirmText="删除"
          danger
          onCancel={() => setRemoveOpen(false)}
          onConfirm={() => void remove()}
        />
      </div>
    </PortalScope>
  );
}
