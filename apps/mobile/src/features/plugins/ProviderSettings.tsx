import { useState } from "react";
import type { JsonValue, PluginContext, PluginSettingsDefinition } from "@tau/plugins";
import { Button } from "@tau/ui";
import { useAppContext } from "../../app/AppContext";
import { useNavigator } from "../../router";
import { createTtsAccount } from "../../services/tts-settings";
import { savePluginProviderConfig } from "../../services/tauri";
import { enqueueProviderConfigWrite, mergeProviderSettings } from "../../services/provider-config";
import { getMobileSettingSnapshot } from "../../services/mobileSettingsBridge";
import { GroupRow } from "../settings/components/ui";
import { useTtsDomain } from "../settings/tts/hooks/useTtsDomain";
import { ProviderConfigForm } from "./ProviderConfigForm";
import { ImagePluginAccounts } from "../settings/images/ImagePluginAccounts";

type Entry = { context: PluginContext; definition: PluginSettingsDefinition };
export function MobileProviderSettings({ entry }: { entry: Entry }) {
  if (entry.definition.target === "images") return <ImagePluginAccounts entry={entry} />;
  if (entry.definition.target === "tts") return <TtsPluginAccounts entry={entry} />;
  if (entry.definition.target === "asr") return <AsrPluginSettings entry={entry} />;
  return null;
}
function TtsPluginAccounts({ entry }: { entry: Entry }) {
  const navigator = useNavigator();
  const { accounts, database, applySnapshot, isPageActive } = useTtsDomain();
  const pluginId = entry.context.pluginId;
  const matching = accounts.filter(item => item.pluginId === pluginId);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const add = async () => {
    setBusy(true);
    setError("");
    try {
      entry.context.signal.throwIfAborted();
      const previous = new Set(accounts.map(item => item.id));
      const saved = await applySnapshot(() =>
        createTtsAccount(database, pluginId, entry.definition.title)
      );
      const created = saved?.ttsProviders?.find(
        item => item.pluginId === pluginId && !previous.has(item.id)
      );
      if (created && isPageActive()) navigator.push("ttsAccount", { instanceId: created.id });
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : "添加失败");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="py-4">
      <p className="text-ink-3 text-tau-meta mb-3">
        管理此插件的账号、模型与音色；在应用语音设置中选择当前服务。
      </p>
      {matching.map(account => (
        <GroupRow
          key={account.id}
          onClick={() => navigator.push("ttsAccount", { instanceId: account.id })}
        >
          <span className="flex-1">{account.name}</span>
          <span className="text-ink-3 text-tau-meta">{account.models.length} 个模型 · 配置</span>
        </GroupRow>
      ))}
      <Button loading={busy} onClick={() => void add()}>
        添加账号
      </Button>
      {error && (
        <p role="alert" className="text-danger text-tau-meta">
          {error}
        </p>
      )}
    </div>
  );
}
function AsrPluginSettings({ entry }: { entry: Entry }) {
  const app = useAppContext();
  const setting = app.syncSettings.safeSetting;
  const account = setting?.speechInput?.plugin.configurations[entry.context.pluginId];
  const [modelId, setModelId] = useState(
    account?.modelId || entry.definition.models?.[0]?.id || ""
  );
  if (!setting || !entry.definition.form) return <p>请启用支持声明式配置的识别插件。</p>;
  const database = setting.database.active;
  return (
    <>
      <label className="text-tau-meta block py-3">
        识别模型
        <input
          aria-label="识别模型"
          className="input-base bg-surface shadow-card mt-2 w-full rounded-xl p-3"
          value={modelId}
          onChange={event => setModelId(event.currentTarget.value)}
        />
      </label>
      <ProviderConfigForm
        form={entry.definition.form}
        context={entry.context}
        stored={(account?.config ?? {}) as JsonValue}
        changed={modelId !== account?.modelId}
        onReset={() => setModelId(account?.modelId || entry.definition.models?.[0]?.id || "")}
        save={config =>
          enqueueProviderConfigWrite(async () => {
            if (!modelId.trim()) throw new Error("请选择识别模型");
            const saved = await savePluginProviderConfig(database, "asr", entry.context.pluginId, {
              config,
              modelId,
            });
            if (getMobileSettingSnapshot()?.database.active !== database) return;
            app.syncSettings.updateSetting(previous =>
              previous.database.active === database
                ? mergeProviderSettings(previous, saved)
                : previous
            );
          })
        }
      />
    </>
  );
}
