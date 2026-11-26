import {
  pluginControlsTranslator,
  pluginControlsCount,
  usePluginControlsI18n,
  PluginControlsError,
  pluginControlsFailure,
} from "./controls.i18n";
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
const t = pluginControlsTranslator.t;

type Entry = { context: PluginContext; definition: PluginSettingsDefinition };
export function MobileProviderSettings({ entry }: { entry: Entry }) {
  usePluginControlsI18n();
  if (entry.definition.target === "images") return <ImagePluginAccounts entry={entry} />;
  if (entry.definition.target === "tts") return <TtsPluginAccounts entry={entry} />;
  if (entry.definition.target === "asr") return <AsrPluginSettings entry={entry} />;
  return null;
}
function TtsPluginAccounts({ entry }: { entry: Entry }) {
  usePluginControlsI18n();
  const navigator = useNavigator();
  const { accounts, database, applySnapshot, isPageActive } = useTtsDomain();
  const pluginId = entry.context.pluginId;
  const matching = accounts.filter(item => item.pluginId === pluginId);
  const [busy, setBusy] = useState(false),
    [failure, setFailure] = useState<{ cause: unknown } | null>(null);
  const error = failure
    ? failure.cause instanceof Error
      ? pluginControlsFailure(failure.cause)
      : t("common.addFailed")
    : "";
  const add = async () => {
    setBusy(true);
    setFailure(null);
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
      setFailure({ cause: issue });
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="py-4">
      <p className="text-ink-3 text-tau-meta mb-3">{t("account.ttsManage")}</p>
      {matching.map(account => (
        <GroupRow
          key={account.id}
          onClick={() => navigator.push("ttsAccount", { instanceId: account.id })}
        >
          <span className="flex-1">{account.name}</span>
          <span className="text-ink-3 text-tau-meta">
            {pluginControlsCount("account.modelCount", account.models.length)}
          </span>
        </GroupRow>
      ))}
      <Button loading={busy} onClick={() => void add()}>
        {t("account.add")}
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
  usePluginControlsI18n();
  const app = useAppContext();
  const setting = app.syncSettings.safeSetting;
  const account = setting?.speechInput?.plugin.configurations[entry.context.pluginId];
  const [modelId, setModelId] = useState(
    account?.modelId || entry.definition.models?.[0]?.id || ""
  );
  if (!setting || !entry.definition.form) return <p>{t("account.asrEnable")}</p>;
  const database = setting.database.active;
  return (
    <>
      <label className="text-tau-meta block py-3">
        {t("account.asrModel")}
        <input
          aria-label={t("account.asrModel")}
          className="input-base bg-surface shadow-card mt-2 w-full rounded-xl p-3"
          value={modelId}
          onChange={event => setModelId(event.currentTarget.value)}
        />
      </label>
      <ProviderConfigForm
        errorText={pluginControlsFailure}
        form={entry.definition.form}
        context={entry.context}
        stored={(account?.config ?? {}) as JsonValue}
        changed={modelId !== account?.modelId}
        onReset={() => setModelId(account?.modelId || entry.definition.models?.[0]?.id || "")}
        save={config =>
          enqueueProviderConfigWrite(async () => {
            if (!modelId.trim())
              throw new PluginControlsError("account.asrChoose", "请选择识别模型");
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
