import { ProviderConfigForm } from "../../plugins/ProviderConfigForm";
import { useEffect, useMemo, useState } from "react";
import { copyJson } from "@tau/plugins/host";
import { ErrorBoundary } from "@tau/ui";
import { ChevronRight, Mic, Trash2 } from "lucide-react";
import { MobileConfirmDialog } from "../../../components/MobileConfirmDialog";
import { useNavigator } from "../../../router";
import {
  deleteTtsAccount,
  renameTtsAccount,
  saveTtsConfig,
  selectTtsUsage,
} from "../../../services/tts-settings";
import { GroupNote, GroupRow } from "../components/ui";
import { ActionButton } from "../storage/fields";
import { TtsPageShell } from "./components/TtsPageShell";
import { TtsCurrentBadge, TtsEmpty, TtsSection, TtsStatus } from "./components/TtsUi";
import { ttsErrorMessage } from "./errors";
import { useTtsDomain } from "./hooks/useTtsDomain";
import { findTtsAccount, resolveTtsModel, resolveTtsVoice, selectionForAccount } from "./model";

export function TtsAccountPage({ instanceId }: { instanceId: string }) {
  const navigator = useNavigator();
  const { runtime, setting, usage, database, providerFor, applySnapshot, isPageActive } =
    useTtsDomain();
  const account = findTtsAccount(setting, instanceId);
  const provider = account ? providerFor(account.pluginId) : undefined;
  const available = !!account && !!provider && !!runtime?.active(provider.context);
  const [name, setName] = useState(account?.name ?? "");
  const [busy, setBusy] = useState<"name" | "current" | "delete" | null>(null);
  const [error, setError] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const accountConfig = account?.config;
  const config = useMemo(() => (accountConfig ? copyJson(accountConfig) : {}), [accountConfig]);
  const modelId = resolveTtsModel(account, usage);
  const isCurrent = usage?.providerId === instanceId;
  const accountName = account?.name;
  useEffect(() => {
    if (accountName) setName(accountName);
  }, [accountName]);

  const saveName = async () => {
    const nextName = name.trim();
    if (!account || !nextName || nextName === account.name || busy) return;
    setBusy("name");
    setError("");
    try {
      await applySnapshot(() => renameTtsAccount(database, account.id, nextName));
    } catch (issue) {
      setError(ttsErrorMessage(issue, account.config, "账号名称保存失败"));
    } finally {
      setBusy(null);
    }
  };

  const activate = async () => {
    if (!account || !available || !modelId || isCurrent || busy) return;
    setBusy("current");
    setError("");
    try {
      await applySnapshot(() =>
        selectTtsUsage(database, selectionForAccount(account, usage, modelId))
      );
    } catch (issue) {
      setError(ttsErrorMessage(issue, account.config, "无法设为当前语音服务"));
    } finally {
      setBusy(null);
    }
  };

  const remove = async () => {
    if (!account || busy) return;
    setBusy("delete");
    setError("");
    try {
      const saved = await applySnapshot(() => deleteTtsAccount(database, account.id));
      if (!saved || !isPageActive()) return;
      setDeleteOpen(false);
      navigator.pop();
    } catch (issue) {
      setError(ttsErrorMessage(issue, account.config, "账号删除失败"));
      setDeleteOpen(false);
    } finally {
      setBusy(null);
    }
  };

  if (!account) {
    return (
      <TtsPageShell title="语音账号">
        <TtsEmpty title="账号不存在" description="它可能已被删除，请返回语音设置查看。" />
      </TtsPageShell>
    );
  }

  const Component = provider?.definition.component;
  return (
    <TtsPageShell
      title={account.name}
      footer={
        <>
          <ActionButton
            label="测试此服务"
            emphasis={false}
            disabled={!available || !modelId || !!busy}
            onClick={() =>
              navigator.push("ttsTest", {
                instanceId: account.id,
                modelId,
                ...(resolveTtsVoice(account, usage, modelId)
                  ? { voiceId: resolveTtsVoice(account, usage, modelId) }
                  : {}),
              })
            }
          />
          <ActionButton
            label={isCurrent ? "当前语音服务" : "设为当前语音服务"}
            emphasis
            busy={busy === "current"}
            disabled={!available || !modelId || isCurrent || !!busy}
            onClick={() => void activate()}
          />
        </>
      }
    >
      <div className="page-enter">
        {!available && (
          <TtsStatus
            tone="warning"
            title="语音插件不可用"
            action={
              <button
                type="button"
                className="text-accent-text"
                onClick={() => navigator.push("plugins", { tab: "installed" })}
              >
                去插件中心启用
              </button>
            }
          >
            已保存的账号、模型与当前选择仍然保留。启用插件后可继续编辑和测试。
          </TtsStatus>
        )}
        <TtsSection label="显示名称">
          <div className="p-3.5">
            <label htmlFor="tts-account-name" className="sr-only">
              显示名称
            </label>
            <div className="flex gap-2">
              <input
                id="tts-account-name"
                className="input-base min-w-0 flex-1 rounded-xl px-3"
                value={name}
                maxLength={80}
                disabled={busy === "delete"}
                onChange={event => setName(event.currentTarget.value)}
              />
              <button
                type="button"
                className="bg-accent-soft text-accent-text text-tau-meta min-h-11 shrink-0 rounded-xl px-3 font-semibold disabled:opacity-50"
                disabled={!name.trim() || name.trim() === account.name || !!busy}
                onClick={() => void saveName()}
              >
                {busy === "name" ? "保存中" : "保存名称"}
              </button>
            </div>
          </div>
        </TtsSection>
        {available && provider.definition.form ? (
          <ProviderConfigForm
            key={account.id}
            form={provider.definition.form}
            context={provider.context}
            stored={config}
            save={async nextConfig => {
              if (!runtime?.active(provider.context)) throw new Error("插件设置已失效");
              await applySnapshot(() =>
                saveTtsConfig(
                  database,
                  account.id,
                  account.pluginId,
                  copyJson(nextConfig),
                  account.models.length ? account.models : [...(provider.definition.models ?? [])]
                )
              );
            }}
          />
        ) : available && Component ? (
          <ErrorBoundary key={account.id}>
            <Component
              context={provider.context}
              ttsConfig={{
                instanceId: account.id,
                value: config,
                models: account.models,
                save: async (nextConfig, models) => {
                  if (!runtime?.active(provider.context)) throw new Error("插件设置已失效");
                  await applySnapshot(() =>
                    saveTtsConfig(
                      database,
                      account.id,
                      account.pluginId,
                      copyJson(nextConfig),
                      models.map(model => ({ ...model }))
                    )
                  );
                },
              }}
            />
          </ErrorBoundary>
        ) : (
          <GroupNote>
            账号凭据由插件管理；当前不渲染插件表单，也不会显示或清除已保存凭据。
          </GroupNote>
        )}
        {error && (
          <TtsStatus tone="error" title="操作失败">
            {error}
          </TtsStatus>
        )}
        <TtsSection label={`模型 · ${account.models.length} 个`}>
          {account.models.slice(0, 3).map(model => (
            <GroupRow key={model.id}>
              <span className="min-w-0 flex-1">
                <span className="text-ink-1 text-tau-sm block truncate font-mono">{model.id}</span>
                {model.label && <span className="text-ink-3 text-tau-sm block">{model.label}</span>}
              </span>
              {isCurrent && usage?.modelId === model.id && <TtsCurrentBadge />}
            </GroupRow>
          ))}
          {!account.models.length && (
            <GroupRow>
              <span className="text-ink-3">尚未保存模型</span>
            </GroupRow>
          )}
          <GroupRow onClick={() => navigator.push("ttsModels", { instanceId: account.id })}>
            <span className="text-accent-text text-tau-body flex-1 font-medium">管理模型</span>
            <ChevronRight size={17} className="text-ink-3" aria-hidden="true" />
          </GroupRow>
        </TtsSection>
        <TtsSection label="更多">
          <GroupRow
            disabled={!available || !modelId}
            onClick={() => navigator.push("ttsClone", { instanceId: account.id, modelId })}
          >
            <Mic size={18} className="text-tag-1" aria-hidden="true" />
            <span className="min-w-0 flex-1">
              <span className="text-ink-1 text-tau-body block font-medium">音色复刻</span>
              <span className="text-ink-3 text-tau-sm block">从参考音频创建可用音色</span>
            </span>
            <ChevronRight size={17} className="text-ink-3" aria-hidden="true" />
          </GroupRow>
          <GroupRow disabled={!!busy} onClick={() => setDeleteOpen(true)}>
            <Trash2 size={18} className="text-danger" aria-hidden="true" />
            <span className="text-danger text-tau-body flex-1 font-medium">删除此账号</span>
          </GroupRow>
        </TtsSection>
      </div>
      <MobileConfirmDialog
        open={deleteOpen}
        title={`删除「${account.name}」？`}
        description="将删除此账号及其模型配置；若它是当前语音服务，会同时清空当前选择。"
        confirmText="删除"
        danger
        loading={busy === "delete"}
        onCancel={() => setDeleteOpen(false)}
        onConfirm={() => void remove()}
      />
    </TtsPageShell>
  );
}
