/** 本地时区自然周的周一（周一起始）0 点；DatePlugin 分组与卡片时间分组共用口径 */
export const startOfWeek = (date: Date): Date => {
  const monday = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  return monday;
};
