import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Node, type Descendant } from "slate";
import type { PluginFlashcardDraft } from "@tau/plugins";
import type { MobileFlashcardRequest } from "../../app/plugins/flashcards";
import { PageHeader } from "../../components/PageHeader";
import { toast } from "../../components/toast";
import { mobileMarkdown } from "../../services/editorMarkdown";
import { CardEditPage } from "../flashcard/CardEditPage";
import { FLASHCARD_TYPE_META } from "../flashcard/constants";

export function PluginFlashcardAiCreation({
  request,
  deckId,
  content,
  onBack,
  onCompleted,
}: {
  request: MobileFlashcardRequest;
  deckId: number;
  content: Descendant[];
  onBack(): void;
  onCompleted(): void;
}) {
  const [source, setSource] = useState(() => mobileMarkdown.getMarkdown(content));
  const [drafts, setDrafts] = useState<PluginFlashcardDraft[]>([]);
  const [editing, setEditing] = useState<number | null>(null);
  const [saved, setSaved] = useState<number[]>([]);
  const generation = useMutation({
    mutationFn: () => request.generate(source),
    onSuccess: cards => {
      if (!request.signal.aborted) setDrafts(cards);
    },
  });
  if (editing !== null) {
    const draft = drafts[editing];
    return (
      <CardEditPage
        key={editing}
        deckId={deckId}
        cardId={-1}
        type={draft.type}
        initialDraft={draft}
        backWithinPage
        createCard={request.save}
        onBack={() => setEditing(null)}
        onSaved={() => {
          setSaved(previous => [...previous, editing]);
          setEditing(null);
        }}
        onError={(error, fallback) => {
          if (!request.signal.aborted)
            toast.error(error instanceof Error ? error.message : fallback);
        }}
      />
    );
  }
  return (
    <div className="mobile-kb-screen bg-page flex h-full flex-col">
      <PageHeader title="AI 制作闪卡" onBack={onBack} />
      <div className="mobile-page-scroll min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-3">
        {!drafts.length ? (
          <>
            <label className="text-ink-2 text-tau-body block space-y-2 font-semibold">
              <span>制卡资料</span>
              <textarea
                aria-label="制卡资料"
                value={source}
                disabled={generation.isPending}
                onChange={event => setSource(event.target.value)}
                placeholder="粘贴需要学习的资料，AI 将生成题目、答案与解析"
                className="bg-surface text-ink-1 border-line-1 rounded-tau-lg min-h-60 w-full border p-4 outline-none"
              />
            </label>
            <p className="text-ink-3 text-tau-sm">
              使用「AI 模型」中为「闪卡」分配的模型。生成后可逐张编辑保存。
            </p>
            {generation.error && (
              <p role="alert" className="text-danger text-tau-sm">
                {generation.error.message}
              </p>
            )}
            <button
              type="button"
              disabled={generation.isPending || !source.trim()}
              onClick={() => generation.mutate()}
              className="bg-accent text-ink-inverse rounded-tau-lg w-full px-4 py-3 font-semibold disabled:opacity-45"
            >
              {generation.isPending ? "正在生成…" : "生成闪卡"}
            </button>
            {generation.isPending && (
              <button type="button" className="text-ink-2 w-full py-3" onClick={onBack}>
                取消生成
              </button>
            )}
          </>
        ) : (
          <>
            <p role="status" className="text-ink-2 text-tau-body">
              已生成 {drafts.length} 张，已保存 {saved.length} 张。点按草稿审阅并保存。
            </p>
            {drafts.map((draft, index) => (
              <button
                type="button"
                key={index}
                disabled={saved.includes(index)}
                onClick={() => setEditing(index)}
                className="bg-surface shadow-card rounded-tau-lg block w-full space-y-2 p-4 text-left disabled:opacity-45"
              >
                <span className="text-accent-text text-tau-sm block">
                  {FLASHCARD_TYPE_META[draft.type].label} ·{" "}
                  {saved.includes(index) ? "已保存" : "编辑并保存"}
                </span>
                <span className="text-ink-1 text-tau-body block whitespace-pre-wrap">
                  {draft.prompt.map(node => Node.string(node)).join("\n")}
                </span>
              </button>
            ))}
            <button
              type="button"
              onClick={() => {
                request.complete();
                onCompleted();
              }}
              className="bg-accent text-ink-inverse rounded-tau-lg w-full px-4 py-3 font-semibold"
            >
              完成
            </button>
          </>
        )}
      </div>
    </div>
  );
}
