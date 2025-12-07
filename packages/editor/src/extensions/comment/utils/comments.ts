import type { Comment as CommentType } from "../../../types";

const getTotalCommentCount = (items: CommentType[] = []): number => {
  return items.reduce((total, comment) => {
    const replies = comment.replies?.length
      ? getTotalCommentCount(comment.replies)
      : 0;
    return total + 1 + replies;
  }, 0);
};

export { getTotalCommentCount };
