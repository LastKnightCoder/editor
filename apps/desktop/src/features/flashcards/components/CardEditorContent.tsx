import { flashcardsTranslator, useFlashcardsI18n } from "../i18n";
import ReferenceEditor from "@/components/FlashcardEditor/components/ReferenceEditor";
import RichTextEditor from "@/components/FlashcardEditor/components/RichTextEditor";
import type { FlashcardData, FlashcardType } from "@/types";
import { textToDescendants } from "@/utils/flashcard";
import { Input, Segmented, Textarea } from "@tau/ui";
import { TYPE_MESSAGE, TYPE_ORDER } from "../model";
import { TYPE_ICON } from "../typeIcons";

import { createFormReference, type FormState } from "../editorModel";
import { AnswerFields } from "./AnswerFields";
import { Field } from "./Field";

export function CardEditorContent({
  form,
  revision,
  isDark,
  patch,
  patchData,
  changeType,
}: {
  form: FormState;
  revision: number;
  isDark: boolean;
  patch(next: Partial<FormState>): void;
  patchData(next: Partial<FlashcardData>): void;
  changeType(type: FlashcardType): void;
}) {
  useFlashcardsI18n();
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <Segmented
        size="sm"
        label={flashcardsTranslator.t("ui.questionType")}
        value={form.type}
        onValueChange={(v: FlashcardType) => changeType(v)}
        className="self-start"
      >
        {TYPE_ORDER.map(type => (
          <Segmented.Item
            key={type}
            value={type}
            icon={TYPE_ICON[type]}
            label={flashcardsTranslator.t(TYPE_MESSAGE[type])}
          />
        ))}
      </Segmented>

      <Field
        label={flashcardsTranslator.t("ui.prompt")}
        aux={
          form.type === "cloze"
            ? flashcardsTranslator.t("ui.selectTextAndMarkItAsABlankInThe")
            : undefined
        }
      >
        <RichTextEditor
          key={`prompt-${revision}-${form.type === "cloze"}`}
          initialValue={form.prompt}
          onChange={value => patch({ prompt: value?.length ? value : textToDescendants("") })}
          allowBlanks={form.type === "cloze"}
          isDark={isDark}
          placeholder={
            form.type === "qa"
              ? flashcardsTranslator.t("ui.aQuestionOrTermToRemember")
              : flashcardsTranslator.t("ui.questionContent")
          }
          minHeight="84px"
        />
      </Field>

      <Field
        label={flashcardsTranslator.t("ui.additionalDetails")}
        aux={flashcardsTranslator.t("ui.optionalShownBelowThePromptDuringReview")}
      >
        <RichTextEditor
          key={`detail-${revision}`}
          initialValue={form.detail}
          onChange={value => patch({ detail: value?.length ? value : textToDescendants("") })}
          isDark={isDark}
          placeholder={flashcardsTranslator.t("ui.backgroundOrConstraints")}
          minHeight="56px"
        />
      </Field>

      <AnswerFields form={form} patchData={patchData} />

      <Field
        label={flashcardsTranslator.t("ui.hint")}
        aux={flashcardsTranslator.t("ui.optionalShownOnRequestDuringReview")}
      >
        <Input
          value={form.data.hint ?? ""}
          onChange={e => patchData({ hint: e.target.value })}
          placeholder={flashcardsTranslator.t("ui.aShortClue")}
        />
      </Field>

      <Field
        label={flashcardsTranslator.t("ui.explanation")}
        aux={flashcardsTranslator.t("ui.optionalShownAfterRevealingTheAnswer")}
      >
        <Textarea
          value={form.data.explanation ?? ""}
          onChange={e => patchData({ explanation: e.target.value })}
          placeholder={flashcardsTranslator.t("ui.whyIsThisTheAnswer")}
          rows={3}
        />
      </Field>

      <Field
        label={flashcardsTranslator.t("ui.references")}
        aux={flashcardsTranslator.t("ui.expandAfterRevealingTheAnswer")}
        action={
          <button
            type="button"
            className="text-accent-text text-[12px] font-medium"
            onClick={() =>
              patch({
                references: [
                  ...form.references,
                  createFormReference({
                    refType: "content",
                    title: "",
                    contentId: undefined,
                    customContent: undefined,
                  }),
                ],
              })
            }
          >
            {flashcardsTranslator.t("ui.add")}
          </button>
        }
      >
        {form.references.length === 0 ? (
          <p className="text-ink-3 text-[12px]">{flashcardsTranslator.t("ui.noReferencesYet")}</p>
        ) : (
          <div className="space-y-4">
            {form.references.map((ref, i) => (
              <ReferenceEditor
                key={`${revision}-${ref.formId}`}
                reference={ref}
                isDark={isDark}
                onChange={next =>
                  patch({
                    references: form.references.map((r, j) =>
                      j === i ? { ...next, formId: ref.formId } : r
                    ),
                  })
                }
                onRemove={() => patch({ references: form.references.filter((_, j) => j !== i) })}
              />
            ))}
          </div>
        )}
      </Field>
    </div>
  );
}
