import type { Flashcard, FlashcardDeck, FlashcardDifficulty } from "@/types";
import { Button, Input, Menu, Segmented, Tag } from "@tau/ui";
import { ChevronDown } from "lucide-react";
import { useState } from "react";
import { STATUS_LABEL, dueText, resumedStatus } from "../model";
import { DeckMark, StatusDot } from "./FlashcardBits";

import type { FormState } from "../editorModel";
import { Field } from "./Field";

const DIFFICULTY: [FlashcardDifficulty, string][] = [
  ["foundation", "基础"],
  ["standard", "常规"],
  ["advanced", "进阶"],
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
  const [tagInput, setTagInput] = useState("");
  const deck = decks.find(d => d.id === form.deckId);
  return (
    <div className="flex flex-col gap-4">
      <Field label="卡组">
        <Menu
          trigger={
            <Button variant="secondary" className="justify-start">
              {deck ? (
                <>
                  <DeckMark deck={deck} size="sm" />
                  <span className="min-w-0 flex-1 truncate text-left">{deck.name}</span>
                </>
              ) : (
                <span className="flex-1 text-left">选择卡组</span>
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

      <Field label="难度">
        <Segmented
          size="sm"
          label="难度"
          value={form.difficulty}
          onValueChange={(v: FlashcardDifficulty) => patch({ difficulty: v })}
        >
          {DIFFICULTY.map(([value, label]) => (
            <Segmented.Item key={value} value={value} label={label} />
          ))}
        </Segmented>
      </Field>

      <Field label="标签">
        {form.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {form.tags.map(tag => (
              <Tag key={tag} onRemove={() => patch({ tags: form.tags.filter(t => t !== tag) })}>
                {tag}
              </Tag>
            ))}
          </div>
        )}
        <Input
          value={tagInput}
          onChange={e => setTagInput(e.target.value)}
          placeholder="回车添加标签"
          onKeyDown={e => {
            if (e.key !== "Enter" || e.nativeEvent.isComposing || e.metaKey || e.ctrlKey) return;
            e.preventDefault();
            const tag = tagInput.trim();
            if (tag && !form.tags.includes(tag)) patch({ tags: [...form.tags, tag] });
            setTagInput("");
          }}
        />
      </Field>

      {card && (
        <Field label="复习信息">
          <dl className="text-ink-2 grid grid-cols-[auto_1fr] gap-x-3.5 gap-y-1 text-[12px]">
            <dt className="text-ink-3">状态</dt>
            <dd>
              <StatusDot status={card.status} />
            </dd>
            <dt className="text-ink-3">下次复习</dt>
            <dd>{dueText(card, now).text}</dd>
            <dt className="text-ink-3">已复习</dt>
            <dd className="tabular-nums">
              {card.reviewCount} 次 · 熟练度 {card.reviewLevel}/9
            </dd>
          </dl>
          {card.status === "suspended" && (
            <p className="text-ink-3 text-[11.5px]">
              已暂停，恢复后为「{STATUS_LABEL[resumedStatus(card)]}」
            </p>
          )}
        </Field>
      )}
    </div>
  );
}
