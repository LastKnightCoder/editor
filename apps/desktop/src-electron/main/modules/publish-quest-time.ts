export interface IPublishQuestActivitySource {
  createTime: number;
  answers: Array<{ createTime: number }>;
}

export function resolveQuestActivityTime(
  entry: IPublishQuestActivitySource,
): number {
  const latestAnswerCreateTime = entry.answers.reduce(
    (latest, answer) => Math.max(latest, answer.createTime || 0),
    0,
  );
  return latestAnswerCreateTime || entry.createTime;
}
