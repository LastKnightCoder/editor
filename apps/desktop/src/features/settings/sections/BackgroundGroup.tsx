import { aboutTranslator, useAboutI18n } from "../about/i18n";
import { useMutation, useQuery } from "@tanstack/react-query";
import { SettingRow, Switch } from "@tau/ui";
import {
  backgroundPreferenceCommands,
  type BackgroundPreferencesPatch,
} from "@/commands/contracts/background-preferences";
import { SettingsGroup } from "../components/SettingsGroup";

export function BackgroundGroup() {
  useAboutI18n();
  const query = useQuery({
    queryKey: ["settings", "background"],
    queryFn: () => backgroundPreferenceCommands.read.call(),
    refetchOnWindowFocus: true,
  });
  const mutation = useMutation({
    mutationFn: (patch: BackgroundPreferencesPatch) =>
      backgroundPreferenceCommands.update.call(patch),
    onSettled: () => query.refetch(),
  });
  const data = query.data;
  const error = mutation.error ?? query.error;
  return (
    <SettingsGroup title={aboutTranslator.t("background.title")}>
      {data ? (
        <>
          <SettingRow
            title={aboutTranslator.t("background.login")}
            description={aboutTranslator.t("background.loginHint")}
          >
            <Switch
              aria-label={aboutTranslator.t("background.login")}
              checked={data.openAtLogin}
              disabled={mutation.isPending}
              onCheckedChange={value => mutation.mutate({ openAtLogin: value })}
            />
          </SettingRow>
          <SettingRow
            title={aboutTranslator.t("background.hidden")}
            description={aboutTranslator.t("background.hiddenHint")}
          >
            <Switch
              aria-label={aboutTranslator.t("background.hidden")}
              checked={data.startHidden}
              disabled={mutation.isPending}
              onCheckedChange={value => mutation.mutate({ startHidden: value })}
            />
          </SettingRow>
          <SettingRow
            title={aboutTranslator.t("background.keep")}
            description={aboutTranslator.t("background.keepHint")}
          >
            <Switch
              aria-label={aboutTranslator.t("background.keep")}
              checked={data.keepBackground}
              disabled={mutation.isPending}
              onCheckedChange={value => mutation.mutate({ keepBackground: value })}
            />
          </SettingRow>
          {data.loginStatus === "requires-approval" && (
            <p className="text-tau-meta text-warn">{aboutTranslator.t("background.approval")}</p>
          )}
          {!data.trayAvailable && (
            <p className="text-tau-meta text-ink-2">{aboutTranslator.t("background.noTray")}</p>
          )}
        </>
      ) : (
        <p className="text-tau-meta text-ink-2">{aboutTranslator.t("background.loading")}</p>
      )}
      {error && (
        <p role="alert" className="text-tau-meta text-warn">
          {error instanceof Error
            ? error.message
            : typeof error === "string"
              ? error
              : aboutTranslator.t("error.save")}
        </p>
      )}
    </SettingsGroup>
  );
}
