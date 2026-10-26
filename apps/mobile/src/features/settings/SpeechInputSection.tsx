import { useState } from "react";
import { isProviderFormComplete, type JsonValue } from "@tau/plugins";
import { useAppContext } from "../../app/AppContext";
import { useMobilePlugins } from "../../app/plugins/context";
import { useNavigator } from "../../router";
import { enqueueProviderConfigWrite, mergeProviderSettings } from "../../services/provider-config";
import { selectPluginProvider } from "../../services/tauri";
import { getMobileSettingSnapshot } from "../../services/mobileSettingsBridge";
import { GroupCard, GroupRow } from "./components/ui";
import { GroupLabel } from "../../components/GroupLabel";

export function SpeechInputSection() {
  const app = useAppContext();
  const runtime = useMobilePlugins();
  const navigator = useNavigator();
  const setting = app.syncSettings.safeSetting;
  const entries = [...(runtime?.settings.entries() ?? [])].filter(
    ([, entry]) => entry.definition.target === "asr" && runtime?.active(entry.context)
  );
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  if (!setting || !entries.length) return null;
  const select = async (pluginId: string) => {
    const expected = setting.speechInput?.plugin.configurations[pluginId];
    if (!expected) return;
    const database = setting.database.active;
    setBusy(true);
    setError("");
    try {
      const saved = await enqueueProviderConfigWrite(() =>
        selectPluginProvider(database, "asr", pluginId, expected as JsonValue)
      );
      if (getMobileSettingSnapshot()?.database.active !== database) return;
      app.syncSettings.updateSetting(previous =>
        previous.database.active === database ? mergeProviderSettings(previous, saved) : previous
      );
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : "选择失败");
    } finally {
      setBusy(false);
    }
  };
  return (
    <section>
      <GroupLabel>语音输入</GroupLabel>
      <GroupCard>
        {entries.map(([id, entry]) => {
          const pluginId = entry.context.pluginId;
          const account = setting.speechInput?.plugin.configurations[pluginId];
          const configured =
            !!account?.modelId &&
            (!entry.definition.form ||
              isProviderFormComplete(entry.definition.form, account.config as JsonValue));
          return (
            <GroupRow key={id}>
              <label className="flex min-w-0 flex-1 items-center gap-3">
                <input
                  type="radio"
                  name="asr-provider"
                  aria-label={entry.definition.title}
                  checked={
                    setting.speechInput?.active === "plugin" &&
                    setting.speechInput.plugin.id === pluginId
                  }
                  disabled={!configured || busy}
                  onChange={() => void select(pluginId)}
                />
                <span>
                  {entry.definition.title}
                  <span className="text-ink-3 text-tau-meta block">
                    {configured ? account.modelId : "未配置"}
                  </span>
                </span>
              </label>
              <button
                className="text-accent-text text-tau-meta min-h-11"
                onClick={() => navigator.push("pluginSettings", { id })}
              >
                配置
              </button>
            </GroupRow>
          );
        })}
      </GroupCard>
      {error && (
        <p role="alert" className="text-danger text-tau-meta">
          {error}
        </p>
      )}
    </section>
  );
}
