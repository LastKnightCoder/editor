import { imageText, useImageSettingsI18n, type ImageSettingsMessageKey } from "./i18n";
import { useState } from "react";
import { isProviderFormComplete } from "@tau/plugins";
import { Check, ChevronRight } from "lucide-react";
import { useNavigator } from "../../../router";
import { GroupCard, GroupNote, GroupRow } from "../components/ui";
import { GroupLabel } from "../../../components/GroupLabel";
import type { ImageProviderConfig } from "../../../types";
import { useImageDomain } from "./useImageDomain";

export function ImageGenerationSection() {
  useImageSettingsI18n();
  const navigator = useNavigator();
  const { setting, providers, accounts, currentId, mutate } = useImageDomain();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ImageSettingsMessageKey | "">("");
  const select = async (account: ImageProviderConfig) => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await mutate({ type: "select", id: account.id, expectedProvider: account });
    } catch {
      setError("error.selectFailed");
    } finally {
      setBusy(false);
    }
  };
  if (!setting) return <p className="text-ink-3 py-8 text-center">{imageText("loading")}</p>;
  return (
    <div className="page-enter">
      <GroupLabel>{imageText("currentService")}</GroupLabel>
      <GroupCard>
        {accounts.length ? (
          accounts.map(account => {
            const provider = providers.find(item => item.context.pluginId === account.pluginId);
            const ready =
              !!provider?.definition.form &&
              !!account.modelId &&
              isProviderFormComplete(provider.definition.form, account.config);
            return (
              <div key={account.id} className="flex items-center">
                <button
                  type="button"
                  disabled={!ready || busy}
                  aria-pressed={currentId === account.id}
                  className="text-tau-body flex min-h-14 min-w-0 flex-1 items-center gap-3 px-3.5 py-3 text-left disabled:opacity-50"
                  onClick={() => void select(account)}
                >
                  <span className="min-w-0 flex-1">
                    <span className="text-ink-1 block truncate font-medium">{account.name}</span>
                    <span className="text-ink-3 text-tau-sm block truncate">
                      {provider
                        ? ready
                          ? account.modelId
                          : imageText("configurationRequired")
                        : imageText("pluginDisabled")}
                    </span>
                  </span>
                  {currentId === account.id && (
                    <Check size={18} className="text-accent" aria-label={imageText("selected")} />
                  )}
                </button>
                {provider && (
                  <button
                    type="button"
                    aria-label={imageText("configureNamed", { name: account.name })}
                    className="text-accent-text text-tau-sm min-h-11 px-3"
                    onClick={() =>
                      navigator.push("imageAccount", {
                        settingsId: provider.id,
                        accountId: account.id,
                      })
                    }
                  >
                    {imageText("configure")}
                  </button>
                )}
              </div>
            );
          })
        ) : (
          <p className="text-ink-3 text-tau-body px-3.5 py-4">{imageText("empty")}</p>
        )}
      </GroupCard>
      <GroupNote>{imageText("uploadHint")}</GroupNote>
      {error && (
        <p role="alert" className="text-danger text-tau-meta py-2">
          {imageText(error)}
        </p>
      )}
      <GroupLabel>{imageText("plugins")}</GroupLabel>
      <GroupCard>
        {providers.map(provider => (
          <GroupRow
            key={provider.id}
            onClick={() => navigator.push("pluginSettings", { id: provider.id })}
          >
            <span className="text-ink-1 text-tau-body min-w-0 flex-1">
              {provider.definition.title}
            </span>
            <span className="text-ink-3 text-tau-sm">{imageText("accountsAndConfig")}</span>
            <ChevronRight size={17} className="text-ink-3" />
          </GroupRow>
        ))}
        <GroupRow onClick={() => navigator.push("plugins", { tab: "store" })}>
          <span className="text-accent-text text-tau-body flex-1">{imageText("pluginCenter")}</span>
          <ChevronRight size={17} className="text-ink-3" />
        </GroupRow>
      </GroupCard>
    </div>
  );
}
