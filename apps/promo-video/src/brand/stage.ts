/**
 * 宣传片「舞台」配色：与软件主题解耦。取色自 Tau 图标的藏青 → 金渐变。
 * appTheme 指定舞台上软件窗口使用的真实主题族。
 */
export type Stage = {
  key: string;
  name: string;
  dark: boolean;
  bg: string;
  glows: { x: string; y: string; size: string; color: string }[];
  ink: string;
  ink2: string;
  ink3: string;
  /** 品牌渐变（藏青 → 金），用于大字标与强调 */
  brand: [string, string];
  appTheme: string;
  appMode: "light" | "dark";
  grain: number;
};

export const STAGES: Record<string, Stage> = {
  midnight: {
    key: "midnight",
    name: "深空",
    dark: true,
    bg: "#05070f",
    glows: [
      { x: "18%", y: "8%", size: "70%", color: "rgba(44, 96, 150, 0.55)" },
      { x: "88%", y: "95%", size: "65%", color: "rgba(196, 152, 78, 0.32)" },
      { x: "60%", y: "40%", size: "50%", color: "rgba(70, 60, 140, 0.18)" },
    ],
    ink: "#f3f1ec",
    ink2: "#a3abbd",
    ink3: "#5f6880",
    brand: ["#8cb8ec", "#ecc98a"],
    appTheme: "ocean",
    appMode: "light",
    grain: 0.05,
  },
  studio: {
    key: "studio",
    name: "冷白",
    dark: false,
    bg: "linear-gradient(180deg, #f8f9fb 0%, #e9edf3 100%)",
    glows: [
      { x: "20%", y: "0%", size: "60%", color: "rgba(80, 140, 210, 0.22)" },
      { x: "85%", y: "100%", size: "60%", color: "rgba(214, 170, 96, 0.2)" },
    ],
    ink: "#0b0f17",
    ink2: "#4b5565",
    ink3: "#9aa2b1",
    brand: ["#1d4e7e", "#b8904a"],
    appTheme: "ocean",
    appMode: "light",
    grain: 0.035,
  },
  graphite: {
    key: "graphite",
    name: "石墨",
    dark: true,
    bg: "#0d0e11",
    glows: [
      { x: "50%", y: "-10%", size: "80%", color: "rgba(255, 255, 255, 0.10)" },
      { x: "80%", y: "90%", size: "55%", color: "rgba(196, 152, 78, 0.18)" },
    ],
    ink: "#f5f5f4",
    ink2: "#a1a1aa",
    ink3: "#5b5b63",
    brand: ["#e8e6e1", "#d9b676"],
    appTheme: "ink",
    appMode: "dark",
    grain: 0.05,
  },
};
