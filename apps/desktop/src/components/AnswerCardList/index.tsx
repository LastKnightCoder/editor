import React from "react";
import { Inbox } from "lucide-react";
import { IAnswer } from "@/types";
import AnswerCard from "../AnswerCard";

interface AnswerCardListProps {
  answers: IAnswer[];
  readOnly?: boolean;
  onDeleteAnswer?: (answerId: number) => void;
  onViewAnswer?: (answerId: number) => void;
}

const AnswerCardList: React.FC<AnswerCardListProps> = ({
  answers,
  readOnly = false,
  onDeleteAnswer,
  onViewAnswer,
}) => {
  if (answers.length === 0) {
    return (
      <div className="text-tau-sm text-ink-3 flex flex-col items-center justify-center gap-2 p-6">
        <Inbox size={20} strokeWidth={1.75} aria-hidden />
        暂无答案
      </div>
    );
  }

  return (
    <div className="flex max-h-[600px] flex-col gap-3 overflow-y-auto p-6">
      {answers.map(answer => (
        <AnswerCard
          key={answer.id}
          answer={answer}
          readOnly={readOnly}
          onDeleteAnswer={onDeleteAnswer}
          onViewAnswer={onViewAnswer}
          contentId={answer.id}
        />
      ))}
    </div>
  );
};

export default AnswerCardList;
