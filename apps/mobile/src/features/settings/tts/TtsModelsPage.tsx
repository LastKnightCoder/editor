import {
  ttsText,
  ttsValue,
  useTtsSettingsI18n,
  ttsIssue,
  ttsIssueText,
  type TtsIssue,
} from "./i18n";
import { useState, type FormEvent } from "react";
import { Trash2 } from "lucide-react";
import { useNavigator } from "../../../router";
import { addTtsModel, deleteTtsModel } from "../../../services/tts-settings";
import { GroupRow } from "../components/ui";
import { ActionButton } from "../storage/fields";
import { TtsPageShell } from "./components/TtsPageShell";
import { TtsCurrentBadge, TtsEmpty, TtsSection, TtsStatus } from "./components/TtsUi";
import { useTtsDomain } from "./hooks/useTtsDomain";
import { findTtsAccount } from "./model";

export function TtsModelsPage({ instanceId }: { instanceId: string }) {
  useTtsSettingsI18n();

  const navigator = useNavigator();
  const { setting, usage, database, applySnapshot } = useTtsDomain();
  const account = findTtsAccount(setting, instanceId);
  const [modelId, setModelId] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [failure, setFailure] = useState<TtsIssue | null>(null);
  const error = ttsIssueText(failure);

  const add = async (event: FormEvent) => {
    event.preventDefault();
    const id = modelId.trim();
    if (!account || !id || busy) return;
    if (account.models.some(model => model.id === id)) {
      setFailure({ key: "validation.duplicateModelId" });
      return;
    }
    setBusy("add");
    setFailure(null);
    try {
      const saved = await applySnapshot(() => addTtsModel(database, account.id, { id }));
      if (!saved) return;
      setModelId("");
    } catch (issue) {
      setFailure(ttsIssue(issue, account.config, "error.modelAddFailed"));
    } finally {
      setBusy(null);
    }
  };

  const remove = async (id: string) => {
    if (!account || busy) return;
    setBusy(id);
    setFailure(null);
    try {
      await applySnapshot(() => deleteTtsModel(database, account.id, id));
    } catch (issue) {
      setFailure(ttsIssue(issue, account.config, "error.modelDeleteFailed"));
    } finally {
      setBusy(null);
    }
  };

  if (!account) {
    return (
      <TtsPageShell title={ttsText("ui.manageModels")}>
        <TtsEmpty
          title={ttsText("ui.accountNotFound")}
          description={ttsText("ui.itMayHaveBeenDeletedReturnTo2")}
        />
      </TtsPageShell>
    );
  }

  return (
    <TtsPageShell
      title={ttsText("ui.manageModels")}
      footer={
        <ActionButton
          label={ttsText("ui.completed")}
          emphasis={false}
          onClick={() => navigator.goBack("ui")}
        />
      }
    >
      <div className="page-enter">
        <TtsSection
          label={account.name}
          note={ttsText("ui.deletingTheCurrentModelSelectsTheFirst")}
        >
          {account.models.map(model => (
            <GroupRow key={model.id}>
              <span className="min-w-0 flex-1">
                <span className="text-ink-1 text-tau-sm block truncate font-mono">{model.id}</span>
                {model.label && <span className="text-ink-3 text-tau-sm block">{model.label}</span>}
              </span>
              {usage?.providerId === account.id && usage.modelId === model.id && (
                <TtsCurrentBadge />
              )}
              <button
                type="button"
                aria-label={ttsText("message.deleteModel", { id: ttsValue(model.id) })}
                disabled={!!busy}
                className="text-danger grid h-10 w-10 shrink-0 place-items-center disabled:opacity-50"
                onClick={() => void remove(model.id)}
              >
                <Trash2 size={17} aria-hidden="true" />
              </button>
            </GroupRow>
          ))}
          {!account.models.length && (
            <GroupRow>
              <span className="text-ink-3 py-2">{ttsText("ui.noModelsYetEnterAModelID")}</span>
            </GroupRow>
          )}
        </TtsSection>
        {error && (
          <TtsStatus tone="error" title={ttsText("ui.modelOperationFailed")}>
            {error}
          </TtsStatus>
        )}
        <section className="mt-4">
          <form onSubmit={event => void add(event)} className="bg-surface rounded-2xl p-4">
            <label htmlFor="tts-custom-model" className="text-ink-2 text-tau-meta mb-2 block">
              {ttsText("ui.addCustomModelID")}
            </label>
            <input
              id="tts-custom-model"
              value={modelId}
              onChange={event => setModelId(event.currentTarget.value)}
              className="input-base w-full rounded-xl px-3 font-mono"
              placeholder={ttsText("ui.enterTheModelIDFromYourProvider")}
              autoCapitalize="off"
              autoCorrect="off"
            />
            <button
              type="submit"
              disabled={!modelId.trim() || !!busy}
              className="bg-accent text-ink-inverse text-tau-body mt-3 min-h-11 w-full rounded-xl font-semibold disabled:opacity-50"
            >
              {busy === "add" ? ttsText("ui.adding") : ttsText("ui.addModel")}
            </button>
            <p className="text-ink-3 text-tau-sm mt-2">
              {ttsText("ui.modelIDsAreUniqueWithinEachAccount")}
            </p>
          </form>
        </section>
      </div>
    </TtsPageShell>
  );
}
