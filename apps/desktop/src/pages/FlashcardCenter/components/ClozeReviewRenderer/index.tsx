import { useState, useMemo } from "react";
import type { Descendant } from "slate";
import type { FlashcardBlankElement } from "@tau/editor/src";

interface ClozeReviewRendererProps {
  richContent: Descendant[];
  revealed: boolean;
  isDark: boolean;
}

// 答案检查函数
const checkAnswer = (
  userAnswer: string,
  correctAnswer: string,
  alternatives?: string[],
): boolean => {
  const normalize = (str: string) => str.trim().toLowerCase();
  const userNorm = normalize(userAnswer);
  const correctNorm = normalize(correctAnswer);

  if (userNorm === correctNorm) return true;

  if (alternatives && alternatives.length > 0) {
    return alternatives.some((alt) => normalize(alt) === userNorm);
  }

  return false;
};

// 辅助函数：从 richContent 提取所有空格
const extractBlanksFromContent = (
  richContent: Descendant[],
): FlashcardBlankElement[] => {
  const blanks: FlashcardBlankElement[] = [];

  const traverse = (node: any) => {
    if (node.type === "flashcard-blank") {
      blanks.push(node);
    }
    if (node.children && Array.isArray(node.children)) {
      node.children.forEach(traverse);
    }
  };

  richContent.forEach(traverse);
  return blanks;
};

const ClozeReviewRenderer = ({
  richContent,
  revealed,
  isDark,
}: ClozeReviewRendererProps) => {
  const [userAnswers, setUserAnswers] = useState<Record<string, string>>({});

  const renderNode = (node: any, index: number): React.ReactNode => {
    // 渲染空格节点
    if (node.type === "flashcard-blank") {
      const element = node as FlashcardBlankElement;
      const userAnswer = userAnswers[element.blankId] || "";
      const isCorrect = checkAnswer(
        userAnswer,
        element.answer,
        element.alternativeAnswers,
      );

      return (
        <span
          key={`blank-${element.blankId}-${index}`}
          className="inline-blank-container"
          style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}
        >
          <input
            type="text"
            value={userAnswer}
            onChange={(e) =>
              setUserAnswers((prev) => ({
                ...prev,
                [element.blankId]: e.target.value,
              }))
            }
            disabled={revealed}
            placeholder={element.placeholder ? `${element.placeholder}` : "___"}
            className="blank-input"
            style={{
              display: "inline-block",
              width: "auto",
              minWidth: "100px",
              maxWidth: "200px",
              padding: "4px 12px",
              margin: "0 2px",
              border: revealed
                ? isCorrect
                  ? "2px solid #10b981"
                  : "2px solid #ef4444"
                : `1px solid ${isDark ? "#64748b" : "#94a3b8"}`,
              borderRadius: "6px",
              backgroundColor: revealed
                ? isCorrect
                  ? isDark
                    ? "rgba(16, 185, 129, 0.15)"
                    : "rgba(16, 185, 129, 0.1)"
                  : isDark
                    ? "rgba(239, 68, 68, 0.15)"
                    : "rgba(239, 68, 68, 0.1)"
                : isDark
                  ? "rgba(255, 255, 255, 0.05)"
                  : "white",
              color: isDark ? "white" : "#1e293b",
              fontSize: "14px",
              outline: "none",
            }}
          />
          {revealed && !isCorrect && (
            <span
              className="correct-answer-hint"
              style={{
                color: "#10b981",
                fontSize: "14px",
                fontWeight: "500",
              }}
            >
              ✓ {element.answer}
            </span>
          )}
        </span>
      );
    }

    // 渲染段落
    if (node.type === "paragraph") {
      return (
        <p
          key={`para-${index}`}
          className="review-paragraph"
          style={{
            marginBottom: "12px",
            lineHeight: "1.8",
            fontSize: "15px",
          }}
        >
          {node.children?.map((child: any, i: number) => renderNode(child, i))}
        </p>
      );
    }

    // 渲染普通文本
    if (node.text !== undefined) {
      return <span key={`text-${index}`}>{node.text}</span>;
    }

    // 递归渲染其他节点
    if (node.children && Array.isArray(node.children)) {
      return (
        <span key={`node-${index}`}>
          {node.children.map((child: any, i: number) => renderNode(child, i))}
        </span>
      );
    }

    return null;
  };

  const stats = useMemo(() => {
    if (!revealed) return null;

    const blanks = extractBlanksFromContent(richContent);
    const correct = blanks.filter((blank) =>
      checkAnswer(
        userAnswers[blank.blankId] || "",
        blank.answer,
        blank.alternativeAnswers,
      ),
    ).length;

    return { total: blanks.length, correct };
  }, [revealed, userAnswers, richContent]);

  return (
    <div className={`cloze-review-container ${isDark ? "dark" : "light"}`}>
      <div className="rich-content">
        {richContent.map((node, index) => renderNode(node, index))}
      </div>

      {revealed && stats && stats.total > 0 && (
        <div
          className="stats-bar"
          style={{
            marginTop: "16px",
            padding: "12px",
            borderRadius: "8px",
            backgroundColor: isDark
              ? "rgba(255, 255, 255, 0.05)"
              : "rgba(0, 0, 0, 0.02)",
            fontSize: "13px",
            color: isDark ? "#94a3b8" : "#64748b",
          }}
        >
          正确率：{stats.correct} / {stats.total} (
          {Math.round((stats.correct / stats.total) * 100)}%)
        </div>
      )}
    </div>
  );
};

export default ClozeReviewRenderer;
