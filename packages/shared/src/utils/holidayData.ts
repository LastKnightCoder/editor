export type HolidayType = 0 | 1 | 2 | 3;

/** timor 年接口的 holiday 为布尔值，条目键为 MM-DD，完整日期位于 date。 */
export function parseHolidayYearResponse(value: unknown): Record<string, HolidayType> {
  if (
    !value ||
    typeof value !== "object" ||
    !("code" in value) ||
    value.code !== 0 ||
    !("holiday" in value) ||
    !value.holiday ||
    typeof value.holiday !== "object"
  ) {
    throw new Error("无效的节假日响应");
  }
  const result: Record<string, HolidayType> = {};
  for (const info of Object.values(value.holiday)) {
    if (
      !info ||
      typeof info !== "object" ||
      typeof info.date !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(info.date) ||
      typeof info.holiday !== "boolean"
    ) {
      throw new Error("无效的节假日条目");
    }
    result[info.date] = info.holiday ? 2 : 3;
  }
  return result;
}
