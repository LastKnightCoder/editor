import { pluginControlsTranslator, usePluginControlsI18n } from "./controls.i18n";
import { useState, useSyncExternalStore } from "react";
import { useQuery } from "@tanstack/react-query";
import { useMobilePlugins } from "../../app/plugins/context";
import type { MobileFlashcardRequest } from "../../app/plugins/flashcards";
import { usePage, usePageLifecycle } from "../../router";
import { CardCreatePage } from "../flashcard/CardCreatePage";
import { CardEditPage } from "../flashcard/CardEditPage";
import type { FlashcardType } from "../flashcard/types";
import { PluginPageShell } from "./PluginPageView";
import { toast } from "../../components/toast";
import { PluginFlashcardAiCreation } from "./PluginFlashcardAiCreation";
const t = pluginControlsTranslator.t;

const empty = () => null;
const subscribeEmpty = () => () => undefined;

export function PluginFlashcardCreate() {
  usePluginControlsI18n();
  const runtime = useMobilePlugins();
  const { params, navigator, entryId } = usePage<{ requestId: number }>();
  const flashcards = runtime?.flashcards;
  const request = useSyncExternalStore(
    flashcards?.subscribe ?? subscribeEmpty,
    flashcards?.getSnapshot ?? empty
  );
  const selected = request?.id === params.requestId ? request : null;
  usePageLifecycle({ onDestroy: () => selected?.dismiss() });
  const back = () => {
    if (navigator.getActiveScreen()?.id === entryId) void navigator.goBackBypassed("ui");
  };
  if (!selected)
    return (
      <PluginPageShell title={t("flashcard.new")}>
        <p role="status">{t("flashcard.closed")}</p>
      </PluginPageShell>
    );
  return <Creation key={selected.id} request={selected} onBack={back} />;
}

function Creation({ request, onBack }: { request: MobileFlashcardRequest; onBack(): void }) {
  usePluginControlsI18n();
  const [selection, setSelection] = useState<{ deckId: number; type: FlashcardType } | null>(null);
  const prepared = useQuery({
    queryKey: ["plugin-flashcard-create", request.id],
    queryFn: request.prepare,
    staleTime: Infinity,
    retry: false,
    gcTime: 0,
  });
  const close = () => {
    request.close();
    onBack();
  };
  if (prepared.isPending || prepared.error)
    return (
      <PluginPageShell title={t("flashcard.new")}>
        <p role={prepared.error ? "alert" : "status"}>
          {prepared.error?.message ?? t("flashcard.preparing")}
        </p>
      </PluginPageShell>
    );
  if (!selection)
    return (
      <CardCreatePage
        defaultDeckId={request.options.deckId ?? -1}
        referenceTitle={request.options.title}
        createDeck={request.createDeck}
        onBack={close}
        onChoose={(deckId, type) => setSelection({ deckId, type })}
        onGenerate={
          request.options.mode === "ai" ? deckId => setSelection({ deckId, type: "qa" }) : undefined
        }
      />
    );
  if (request.options.mode === "ai")
    return (
      <PluginFlashcardAiCreation
        request={request}
        deckId={selection.deckId}
        content={prepared.data}
        onBack={close}
        onCompleted={onBack}
      />
    );
  return (
    <CardEditPage
      deckId={selection.deckId}
      cardId={-1}
      type={selection.type}
      initialPrompt={prepared.data}
      createCard={request.save}
      onBack={close}
      onSaved={() => {
        request.complete();
        onBack();
      }}
      onError={(error, fallback) => {
        if (!request.signal.aborted) toast.error(error instanceof Error ? error.message : fallback);
      }}
    />
  );
}
