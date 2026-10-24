import { useState } from "react";
import { ChevronRight, Plus, Volume2 } from "lucide-react";
import { useNavigator, usePageLifecycle } from "../../../router";
import { createTtsAccount, selectTtsUsage } from "../../../services/tts-settings";
import type { TTSUsageConfig } from "../../../types";
import { GroupCard, GroupRow } from "../components/ui";
import { ActionButton } from "../storage/fields";
import { TtsChoiceSheet, TtsVoicePicker } from "./components/TtsSelectionSheets";
import {
  TtsCurrentBadge,
  TtsEmpty,
  TtsProviderTile,
  TtsSection,
  TtsStatus,
} from "./components/TtsUi";
import { ttsErrorMessage } from "./errors";
import { useTtsDomain } from "./hooks/useTtsDomain";
import { useTtsVoices } from "./hooks/useTtsVoices";
import { findTtsAccount, selectionForAccount } from "./model";

type Sheet = "account" | "model" | "voice" | "add" | null;

export function TtsSettingsSection() {
  const navigator = useNavigator();
  const {
    setting,
    accounts,
    usage,
    providers,
    providerFor,
    database,
    applySnapshot,
    isPageActive,
  } = useTtsDomain();
  const [sheet, setSheet] = useState<Sheet>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const currentAccount = findTtsAccount(setting, usage?.providerId);
  const currentProvider = currentAccount ? providerFor(currentAccount.pluginId) : undefined;
  const currentModel = usage?.modelId ?? "";
  const voices = useTtsVoices(currentAccount, currentModel, !!currentProvider);
  usePageLifecycle({
    onResume: () => {
      if (currentAccount && currentProvider && currentModel) void voices.refetch();
    },
  });

  const select = async (selection: TTSUsageConfig) => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const saved = await applySnapshot(() => selectTtsUsage(database, selection));
      if (!saved || !isPageActive()) return;
      setSheet(null);
    } catch (issue) {
      setError(ttsErrorMessage(issue, currentAccount?.config, "无法保存当前语音服务"));
    } finally {
      setBusy(false);
    }
  };

  const addAccount = async (pluginId: string, name: string) => {
    if (busy) return;
    setBusy(true);
    setError("");
    const previousIds = new Set(accounts.map(account => account.id));
    try {
      const saved = await applySnapshot(() => createTtsAccount(database, pluginId, name));
      if (!saved || !isPageActive()) return;
      const created = saved.ttsProviders?.find(
        account => account.pluginId === pluginId && !previousIds.has(account.id)
      );
      setSheet(null);
      if (created) navigator.push("ttsAccount", { instanceId: created.id });
    } catch (issue) {
      setError(ttsErrorMessage(issue, undefined, "无法添加语音账号"));
    } finally {
      setBusy(false);
    }
  };

  const eligibleAccounts = accounts.filter(
    account => account.models.length > 0 && !!providerFor(account.pluginId)
  );
  const selectedVoice = voices.data?.voices.find(voice => voice.id === usage?.voiceId);
  const openPluginCenter = () => navigator.push("plugins", { tab: "store" });
  const addSheet = (
    <TtsChoiceSheet
      open={sheet === "add"}
      title="添加语音服务"
      choices={providers.map(provider => ({
        id: provider.context.pluginId,
        label: provider.definition.title,
        description: provider.definition.description ?? "语音合成服务",
      }))}
      onSelect={id => {
        const provider = providers.find(item => item.context.pluginId === id);
        if (provider) void addAccount(id, provider.definition.title);
      }}
      onClose={() => setSheet(null)}
    />
  );

  if (!setting) return <p className="text-ink-3 py-8 text-center">正在读取语音设置…</p>;

  if (!accounts.length) {
    return (
      <div className="page-enter">
        <GroupCard>
          <TtsEmpty
            title="还没有语音服务"
            description={
              providers.length
                ? "添加语音插件的账号，选择模型与音色后即可合成试听。"
                : "先在插件中心安装并启用支持语音合成的插件，再回来添加账号。"
            }
            actions={
              providers.length ? (
                <>
                  <ActionButton
                    label={busy ? "正在添加…" : "添加语音服务"}
                    emphasis
                    busy={busy}
                    disabled={busy}
                    onClick={() => setSheet("add")}
                  />
                  <button
                    type="button"
                    className="text-accent-text text-tau-body min-h-11 font-medium"
                    onClick={openPluginCenter}
                  >
                    去插件中心
                  </button>
                </>
              ) : (
                <ActionButton label="去插件中心" emphasis onClick={openPluginCenter} />
              )
            }
          />
        </GroupCard>
        {error && (
          <TtsStatus tone="error" title="操作失败">
            {error}
          </TtsStatus>
        )}
        {!!providers.length && (
          <TtsSection label="已启用且支持语音的插件">
            {providers.map(provider => (
              <GroupRow
                key={provider.id}
                onClick={() =>
                  void addAccount(provider.context.pluginId, provider.definition.title)
                }
              >
                <TtsProviderTile name={provider.definition.title} />
                <span className="min-w-0 flex-1">
                  <span className="text-ink-1 text-tau-body block font-medium">
                    {provider.definition.title}
                  </span>
                  <span className="text-ink-3 text-tau-sm block truncate">
                    {provider.definition.description ?? "语音合成服务"}
                  </span>
                </span>
                <ChevronRight size={17} className="text-ink-3" aria-hidden="true" />
              </GroupRow>
            ))}
          </TtsSection>
        )}
        {addSheet}
      </div>
    );
  }

  return (
    <div className="page-enter">
      {currentAccount && !currentProvider && (
        <TtsStatus
          tone="warning"
          title={`${currentAccount.name} 的插件已停用`}
          action={
            <button type="button" className="text-accent-text" onClick={openPluginCenter}>
              去插件中心启用
            </button>
          }
        >
          已保存的账号、模型与当前选择仍然保留，不会自动切换到其他服务。
        </TtsStatus>
      )}
      <TtsSection label="当前服务" note="后续语音消费方使用这里的选择；测试任意账号都不会改写它。">
        <GroupRow
          disabled={busy}
          onClick={() => {
            if (!eligibleAccounts.length) {
              setError("请先在账号中添加模型，并确认对应语音插件已启用");
              return;
            }
            setSheet("account");
          }}
        >
          <span className="text-ink-1 text-tau-body flex-1">账号</span>
          <span className="text-ink-3 text-tau-meta max-w-[55%] truncate">
            {currentAccount?.name ?? "未设置"}
          </span>
          <ChevronRight size={17} className="text-ink-3" aria-hidden="true" />
        </GroupRow>
        {currentAccount && (
          <GroupRow
            disabled={busy || !currentProvider || !currentAccount.models.length}
            onClick={() => setSheet("model")}
          >
            <span className="text-ink-1 text-tau-body flex-1">模型</span>
            <span className="text-ink-3 text-tau-sm max-w-[55%] truncate font-mono">
              {currentModel || "未设置"}
            </span>
            <ChevronRight size={17} className="text-ink-3" aria-hidden="true" />
          </GroupRow>
        )}
        {currentAccount && currentModel && (
          <GroupRow disabled={busy || !currentProvider} onClick={() => setSheet("voice")}>
            <span className="min-w-0 flex-1">
              <span className="text-ink-1 text-tau-body block">音色</span>
              <span className="text-ink-3 text-tau-sm block">从服务商获取，也可输入音色 ID</span>
            </span>
            <span className="text-ink-3 text-tau-meta max-w-[45%] truncate">
              {selectedVoice?.name || usage?.voiceId || "未设置"}
            </span>
            <ChevronRight size={17} className="text-ink-3" aria-hidden="true" />
          </GroupRow>
        )}
        <GroupRow
          disabled={!currentAccount || !currentProvider || !currentModel}
          onClick={() =>
            currentAccount &&
            navigator.push("ttsTest", {
              instanceId: currentAccount.id,
              modelId: currentModel,
              ...(usage?.voiceId ? { voiceId: usage.voiceId } : {}),
            })
          }
        >
          <Volume2 size={18} className="text-accent-text" aria-hidden="true" />
          <span className="text-accent-text text-tau-body flex-1 font-medium">测试当前服务</span>
        </GroupRow>
      </TtsSection>
      {error && (
        <TtsStatus tone="error" title="语音设置未保存">
          {error}
        </TtsStatus>
      )}
      <TtsSection
        label="语音服务"
        note="同一插件可添加多个账号。插件停用后配置保留，恢复启用后继续使用。"
      >
        {accounts.map(account => {
          const available = !!providerFor(account.pluginId);
          const current = usage?.providerId === account.id;
          return (
            <GroupRow
              key={account.id}
              onClick={() => navigator.push("ttsAccount", { instanceId: account.id })}
            >
              <TtsProviderTile name={account.name} />
              <span className="min-w-0 flex-1">
                <span className="text-ink-1 text-tau-body block truncate font-medium">
                  {account.name}
                </span>
                <span className="text-ink-3 text-tau-sm block truncate">
                  {available
                    ? `${account.models.length} 个模型 · 配置已保存`
                    : "插件不可用 · 配置已保留"}
                </span>
              </span>
              {current && <TtsCurrentBadge unavailable={!available} />}
              <ChevronRight size={17} className="text-ink-3" aria-hidden="true" />
            </GroupRow>
          );
        })}
        <GroupRow disabled={busy} onClick={() => setSheet("add")}>
          <Plus size={18} className="text-accent-text" aria-hidden="true" />
          <span className="text-accent-text text-tau-body flex-1 font-medium">添加语音服务</span>
        </GroupRow>
      </TtsSection>
      <TtsChoiceSheet
        open={sheet === "account"}
        title="选择当前账号"
        choices={eligibleAccounts.map(account => ({
          id: account.id,
          label: account.name,
          description: providerFor(account.pluginId)?.definition.title,
        }))}
        selectedId={usage?.providerId}
        onSelect={id => {
          const account = accounts.find(item => item.id === id);
          if (account) void select(selectionForAccount(account, usage));
        }}
        onClose={() => setSheet(null)}
      />
      {currentAccount && (
        <TtsChoiceSheet
          open={sheet === "model"}
          title="选择当前模型"
          choices={currentAccount.models.map(model => ({
            id: model.id,
            label: model.label ?? model.id,
            description: model.label ? model.id : undefined,
          }))}
          selectedId={currentModel}
          onSelect={modelId => usage && void select({ ...usage, modelId, voiceId: "" })}
          onClose={() => setSheet(null)}
        />
      )}
      <TtsVoicePicker
        open={sheet === "voice"}
        voices={voices.data?.voices}
        loading={voices.isFetching}
        error={voices.error ? ttsErrorMessage(voices.error, currentAccount?.config) : undefined}
        selectedId={usage?.voiceId ?? ""}
        onSelect={voiceId => usage && void select({ ...usage, voiceId })}
        onRefresh={() => void voices.refetch()}
        onClose={() => setSheet(null)}
      />
      {addSheet}
    </div>
  );
}
