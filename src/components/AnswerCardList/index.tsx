import React from "react";
import { IAnswer } from "@/types";
import useGridLayout from "@/hooks/useGridLayout";
import AnswerCard from "../AnswerCard";
import { Empty } from "antd";

interface AnswerCardListProps {
  answers: IAnswer[];
  readOnly?: boolean;
  onDeleteAnswer?: (answerId: number) => void;
  onViewAnswer?: (answerId: number) => void;
  minWidth?: number;
  maxWidth?: number;
  gap?: number;
}

const AnswerCardList: React.FC<AnswerCardListProps> = ({
  answers,
  readOnly = false,
  onDeleteAnswer,
  onViewAnswer,
  minWidth = 280,
  maxWidth = 350,
  gap = 24,
}) => {
  const { gridContainerRef, itemWidth } = useGridLayout({
    minWidth,
    maxWidth,
    gap,
  });

  if (answers.length === 0) {
    return (
      <div
        ref={gridContainerRef}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 24,
          boxSizing: "border-box",
        }}
      >
        <Empty description="暂无答案" />
      </div>
    );
  }

  return (
    <div
      ref={gridContainerRef}
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap,
        padding: 24,
        boxSizing: "border-box",
      }}
    >
      {answers.map((answer) => (
        <AnswerCard
          key={answer.id}
          answer={answer}
          itemWidth={itemWidth}
          readOnly={readOnly}
          onDeleteAnswer={onDeleteAnswer}
          onViewAnswer={onViewAnswer}
        />
      ))}
    </div>
  );
};

export default AnswerCardList;
