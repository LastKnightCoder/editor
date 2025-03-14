export interface StatisticData {
  id: number;
  date: string;
  statisticType: string;
  content: {
    count: number;
    wordsCount: number;
  };
}
