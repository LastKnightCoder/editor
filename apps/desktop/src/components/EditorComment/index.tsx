import React, { CSSProperties, RefObject, useCallback, useState } from "react";
import classNames from "classnames";
import { motion } from "motion/react";
import type { Path } from "slate";
import type { CustomEditor } from "@tau/editor";
import { type CommentElement } from "@tau/editor-comment/types";
import CommentCard from "./CommentCard";
import useCommentPositions from "./hooks/useCommentPositions";

interface EditorCommentProps {
  editorRef: RefObject<CustomEditor | null>;
  containerRef: RefObject<HTMLDivElement | null>;
  show: boolean;
  className?: string;
  style?: CSSProperties;
  minCardHeight?: number;
  cardGap?: number;
  onCommentClick?: (element: CommentElement, path: Path) => void;
}

const EditorComment: React.FC<EditorCommentProps> = ({
  editorRef,
  containerRef,
  show,
  className,
  style,
  minCardHeight = 140,
  cardGap = 16,
  onCommentClick,
}) => {
  const [cardHeights, setCardHeights] = useState<Record<string, number>>({});
  const positions = useCommentPositions(
    editorRef,
    containerRef,
    minCardHeight,
    cardGap,
    cardHeights
  );

  const handleHeightChange = useCallback((id: string, height: number) => {
    setCardHeights(prev => {
      if (Math.abs((prev[id] ?? 0) - height) < 1) {
        return prev;
      }
      return { ...prev, [id]: height };
    });
  }, []);

  const handleCardClick = useCallback(
    (position: (typeof positions)[number]) => {
      if (position.domNode) {
        position.domNode.scrollIntoView({
          behavior: "smooth",
          block: "center",
        });
      }
      onCommentClick?.(position.element, position.path);
    },
    [onCommentClick]
  );

  return (
    <motion.div
      layout
      layoutRoot
      className={classNames(
        "relative transition-all duration-300",
        !show && "pointer-events-none translate-x-4 opacity-0",
        className
      )}
      style={style}
    >
      <div className="relative h-full">
        {positions.map(position => (
          <CommentCard
            key={position.element.uuid}
            position={position}
            onClick={() => handleCardClick(position)}
            onHeightChange={height => handleHeightChange(position.element.uuid, height)}
          />
        ))}
      </div>
    </motion.div>
  );
};

export type { EditorCommentProps };
export default EditorComment;
