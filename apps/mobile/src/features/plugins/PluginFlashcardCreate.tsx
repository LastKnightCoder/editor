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

const empty = () => null;
const subscribeEmpty = () => () => undefined;

export function PluginFlashcardCreate() {
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
      <PluginPageShell title="新建闪卡">
        <p role="status">建卡请求已结束，请从插件重新打开。</p>
      </PluginPageShell>
    );
  return <Creation key={selected.id} request={selected} onBack={back} />;
}

function Creation({ request, onBack }: { request: MobileFlashcardRequest; onBack(): void }) {
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
      <PluginPageShell title="新建闪卡">
        <p role={prepared.error ? "alert" : "status"}>
          {prepared.error?.message ?? "正在准备题干与参考资料…"}
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
