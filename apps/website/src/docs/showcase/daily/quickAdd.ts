/**
 * 示意用的快速添加解析：覆盖文档里举的几种说法（今天/明天/后天、周几、几点、#项目、每天/每周），
 * 不追求和软件完全一致，只让读者感受到「一句话就能记下」。
 */
export type QuickKind = "normal" | "deadline" | "recurring";
export type Bucket = "today" | "tomorrow" | "later" | "none";

export interface QuickParsed {
  title: string;
  kind: QuickKind;
  bucket: Bucket;
  /** 时间槽主行，如 17:00、周四 */
  main?: string;
  /** 时间槽副行，如 截止、打卡 */
  sub?: string;
  /** 识别结果的说明文字 */
  label: string;
  project?: string;
}

const WEEKDAYS = "一二三四五六日";

function pickTime(text: string): { time?: string; rest: string } {
  const clock = /(\d{1,2})[:：](\d{2})/.exec(text);
  if (clock)
    return {
      time: `${clock[1].padStart(2, "0")}:${clock[2]}`,
      rest: text.replace(clock[0], ""),
    };
  const hour = /(上午|下午|晚上)?\s*(\d{1,2})\s*点(半)?/.exec(text);
  if (!hour) return { rest: text };
  let value = Number(hour[2]);
  if ((hour[1] === "下午" || hour[1] === "晚上") && value < 12) value += 12;
  return {
    time: `${String(value).padStart(2, "0")}:${hour[3] ? "30" : "00"}`,
    rest: text.replace(hour[0], ""),
  };
}

export function parseQuickAdd(input: string): QuickParsed | null {
  let text = input.trim();
  if (!text) return null;

  let project: string | undefined;
  text = text.replace(/#(\S+)/, (_, name: string) => {
    project = name;
    return "";
  });

  const recurring = /每(天|周[一二三四五六日、]+|个?工作日)/.exec(text);
  if (recurring) {
    const title = text.replace(recurring[0], "").trim();
    return {
      title,
      kind: "recurring",
      bucket: "today",
      main: recurring[1] === "天" ? "每天" : recurring[0].replace("每", ""),
      sub: "打卡",
      label: `周期 · ${recurring[0]}`,
      project,
    };
  }

  let bucket: Bucket = "none";
  let day: string | undefined;
  const dayWord = /(今天|明天|后天|周([一二三四五六日]))/.exec(text);
  if (dayWord) {
    text = text.replace(dayWord[0], "");
    day = dayWord[1];
    bucket = day === "今天" ? "today" : day === "明天" ? "tomorrow" : "later";
  }
  const { time, rest } = pickTime(text);
  const title = rest.replace(/\s+/g, " ").trim();
  if (!day && !time)
    return {
      title,
      kind: "normal",
      bucket: "none",
      label: "普通任务",
      project,
    };
  if (!day) bucket = "today";
  return {
    title,
    kind: "deadline",
    bucket,
    main: time ?? (day && WEEKDAYS.includes(day.slice(-1)) ? day : "全天"),
    sub: "截止",
    label: `截止 · ${day ?? "今天"}${time ? ` ${time}` : ""}`,
    project,
  };
}
