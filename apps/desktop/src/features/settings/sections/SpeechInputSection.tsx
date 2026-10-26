import { useState } from "react";
import { defaultSpeechInputSetting } from "@tau/asr";
import { isProviderFormComplete, type JsonValue } from "@tau/plugins";
import { Button, Radio, SettingRow } from "@tau/ui";
import useSettingStore from "@/stores/useSettingStore";
import { useDesktopPlugins } from "@/app/plugins/context";
import { updateSpeechInput } from "@/services/speechInput";
import { openProviderSettings } from "@/services/open-provider-settings";
import { SettingsGroup } from "../components/SettingsGroup";

export function SpeechInputSection() {
  const stored = useSettingStore(state => state.setting.speechInput);
  const setting = stored ?? defaultSpeechInputSetting();
  const runtime = useDesktopPlugins();
  const sections = runtime?.listSettings().filter(item => item.definition.target === "asr") ?? [];
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const select = async (pluginId?: string) => {
    setBusy(true);
    setError("");
    try {
      await updateSpeechInput({
        kind: "select",
        pluginId,
        expected: pluginId ? setting.plugin.configurations[pluginId] : undefined,
      });
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : "选用失败");
    } finally {
      setBusy(false);
    }
  };
  return (
    <SettingsGroup
      title="语音输入"
      description="选择实时语音输入服务；账号和识别模型在插件页配置。"
    >
      <SettingRow
        title={
          <Radio
            name="speech-provider"
            value="native"
            label="系统语音识别"
            checked={setting.active === "native"}
            disabled={busy}
            onChange={() => void select()}
          />
        }
        description="可用性取决于当前系统支持。"
      />
      {sections.map(section => {
        const id = section.context.pluginId;
        const account = setting.plugin.configurations[id];
        const ready =
          !!account?.modelId &&
          (!section.definition.form ||
            isProviderFormComplete(section.definition.form, account.config as JsonValue));
        return (
          <SettingRow
            key={section.key}
            title={
              <Radio
                name="speech-provider"
                value={id}
                label={section.definition.title}
                checked={setting.active === "plugin" && setting.plugin.id === id}
                disabled={busy || !ready}
                onChange={() => void select(id)}
              />
            }
            description={ready ? account.modelId : "未配置"}
          >
            <Button onClick={() => openProviderSettings(id, section.key, "voice")}>配置</Button>
          </SettingRow>
        );
      })}
      {error && (
        <p role="alert" className="text-danger text-tau-meta">
          {error}
        </p>
      )}
    </SettingsGroup>
  );
}
