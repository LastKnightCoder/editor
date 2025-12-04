import type { CommentPosition } from "../types";

const resolveCollisions = (
  positions: CommentPosition[],
  cardGap: number,
): CommentPosition[] => {
  if (!positions.length) return positions;

  const adjusted = positions.map((position) => ({ ...position }));

  for (let index = 1; index < adjusted.length; index++) {
    const previous = adjusted[index - 1];
    const current = adjusted[index];

    const minimumTop = previous.displayY + previous.cardHeight + cardGap;
    if (current.displayY < minimumTop) {
      current.displayY = minimumTop;
    }
  }

  return adjusted;
};

export { resolveCollisions };
