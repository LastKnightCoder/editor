import { useMemo, memo } from "react";
import { IQuestion } from "@/types/question";
import QuestionItem, { type QuestionItemHandlers } from "./QuestionItem";

interface QuestionListProps extends QuestionItemHandlers {
  questions: IQuestion[];
  groups: { id: number; title: string }[];
  answerTitles: Record<number, string>;
  answerTypes: Record<number, string>;
}

const QuestionList = memo(
  ({
    questions,
    groups,
    answerTitles,
    answerTypes,
    onUpdateTitle,
    onOpenNewAnswer,
    onOpenSelectAnswer,
    onMoveToGroup,
    onDelete,
    onReorder,
    onOpenAnswer,
    onDeleteAnswer,
  }: QuestionListProps) => {
    const allQuestionIds = useMemo(
      () => questions.map((q) => q.id),
      [questions],
    );

    return (
      <div className="flex flex-col px-2">
        {questions.map((q, index) => (
          <QuestionItem
            key={q.id}
            showBorder={index !== questions.length - 1}
            question={q}
            groups={groups}
            allQuestionIds={allQuestionIds}
            answerTitles={answerTitles}
            answerTypes={answerTypes}
            onUpdateTitle={onUpdateTitle}
            onOpenNewAnswer={onOpenNewAnswer}
            onOpenSelectAnswer={onOpenSelectAnswer}
            onMoveToGroup={onMoveToGroup}
            onDelete={onDelete}
            onReorder={onReorder}
            onOpenAnswer={onOpenAnswer}
            onDeleteAnswer={onDeleteAnswer}
          />
        ))}
      </div>
    );
  },
);

QuestionList.displayName = "QuestionList";

export default QuestionList;
