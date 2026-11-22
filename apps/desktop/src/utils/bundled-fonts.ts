import manifest from "@/assets/fonts/hand/hand-font.json";

export const BUNDLED_FONTS = [
  {
    name: "小赖 SC",
    kind: "chinese",
    fontFamily: manifest
      .filter(entry => entry.file.startsWith("xiaolai-"))
      .map(entry => `"${entry.family}"`)
      .join(", "),
  },
  {
    name: "Shantell Sans",
    kind: "english",
    fontFamily: '"Tau Hand Latin"',
  },
] as const;

export function resolveFontStack(kind: "text" | "code", ...fonts: string[]): string {
  const families = fonts
    .filter(Boolean)
    .map(
      font => BUNDLED_FONTS.find(entry => entry.name === font)?.fontFamily ?? JSON.stringify(font)
    );
  const fallback = kind === "code" ? "ui-monospace, monospace" : "system-ui, sans-serif";
  return [...families, fallback].join(", ");
}
