/** 按时段给建议问题：早上问计划，下午看安排，晚上做回顾 */
export function suggestionsFor(now = new Date()) {
  const hour = now.getHours();
  return hour < 12
    ? ["今天该做什么", "这周还有哪些没完成的待办", "总结昨天的日记"]
    : hour < 18
      ? ["今天还剩哪些安排", "帮我把明天的安排理一理", "最近在写哪些笔记"]
      : ["总结一下今天", "明天有哪些日程", "这周日记里有什么值得记下来的"];
}
