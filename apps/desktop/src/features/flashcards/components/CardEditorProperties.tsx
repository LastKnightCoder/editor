import {
  flashcardsTranslator,
  flashcardsCount,
  flashcardsDisplayContext,
  useFlashcardsI18n,
  type FlashcardsMessageKey,
} from "../i18n";
import { dueText } from "../format";
import type { Flashcard, FlashcardDeck, FlashcardDifficulty } from "@/types";
import { Button, Menu, Segmented } from "@tau/ui";
import { ChevronDown } from "lucide-react";
import AddTag from "@/components/AddTag";
import { STATUS_MESSAGE, resumedStatus } from "../model";
import { DeckMark, StatusDot } from "./FlashcardBits";

import type { FormState } from "../editorModel";
import { Field } from "./Field";

const DIFFICULTY: [FlashcardDifficulty, FlashcardsMessageKey][] = [
  ["foundation", "ui.foundation"],
  ["standard", "ui.standard"],
  ["advanced", "ui.advanced"],
];

export function CardEditorProperties({
  form,
  card,
  decks,
  now,
  patch,
}: {
  form: FormState;
  card: Flashcard | null;
  decks: FlashcardDeck[];
  now: number;
  patch(next: Partial<FormState>): void;
}) {
  useFlashcardsI18n();
  const deck = decks.find(d => d.id === form.deckId);
  return (
    <div className="flex flex-col gap-4">
      <Field label={flashcardsTranslator.t("ui.deck")}>
        <Menu
          trigger={
            <Button variant="secondary" className="justify-start">
              {deck ? (
                <>
                  <DeckMark deck={deck} size="sm" />
                  <span className="min-w-0 flex-1 truncate text-left">{deck.name}</span>
                </>
              ) : (
                <span className="flex-1 text-left">{flashcardsTranslator.t("ui.chooseDeck")}</span>
              )}
              <ChevronDown size={14} strokeWidth={1.75} />
            </Button>
          }
        >
          {decks.map(d => (
            <Menu.Item
              key={d.id}
              icon={<DeckMark deck={d} size="xs" />}
              onSelect={() => patch({ deckId: d.id })}
            >
              {d.name}
            </Menu.Item>
          ))}
        </Menu>
      </Field>

      <Field label={flashcardsTranslator.t("ui.difficulty")}>
        <Segmented
          size="sm"
          label={flashcardsTranslator.t("ui.difficulty")}
          value={form.difficulty}
          onValueChange={(v: FlashcardDifficulty) => patch({ difficulty: v })}
        >
          {DIFFICULTY.map(([value, label]) => (
            <Segmented.Item key={value} value={value} label={flashcardsTranslator.t(label)} />
          ))}
        </Segmented>
      </Field>

      <Field label={flashcardsTranslator.t("ui.tags")}>
        <AddTag
          tags={form.tags}
          addTag={tag => patch({ tags: [...form.tags, tag] })}
          removeTag={tag => patch({ tags: form.tags.filter(t => t !== tag) })}
          editTag={(oldTag, newTag) =>
            patch({ tags: form.tags.map(t => (t === oldTag ? newTag : t)) })
          }
        />
      </Field>

      {card && (
        <Field label={flashcardsTranslator.t("ui.reviewInformation")}>
          <dl className="text-ink-2 grid grid-cols-[auto_1fr] gap-x-3.5 gap-y-1 text-[12px]">
            <dt className="text-ink-3">{flashcardsTranslator.t("ui.status")}</dt>
            <dd>
              <StatusDot status={card.status} />
            </dd>
            <dt className="text-ink-3">{flashcardsTranslator.t("ui.nextReview")}</dt>
            <dd>{dueText(card, now, flashcardsDisplayContext()).text}</dd>
            <dt className="text-ink-3">{flashcardsTranslator.t("ui.reviewed")}</dt>
            <dd className="tabular-nums">
              {flashcardsTranslator.t("stats.stability", {
                reviews: flashcardsCount("count.reviews", card.reviewCount),
                days:
                  card.memoryStability == null
                    ? "—"
                    : flashcardsTranslator.t("span.days", {
                        count: card.memoryStability,
                        amount: card.memoryStability.toLocaleString(
                          flashcardsDisplayContext().locale,
                          { minimumFractionDigits: 1, maximumFractionDigits: 1 }
                        ),
                      }),
              })}
            </dd>
          </dl>
          {card.status === "suspended" && (
            <p className="text-ink-3 text-[11.5px]">
              {flashcardsTranslator.t("stats.resumedStatus", {
                status: flashcardsTranslator.t(STATUS_MESSAGE[resumedStatus(card)]),
              })}
            </p>
          )}
        </Field>
      )}
    </div>
  );
}
