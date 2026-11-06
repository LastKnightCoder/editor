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

/** 内置字体名映射到实际字体栈，小赖的独立分片需一起参与字形回退。 */
export function resolveFontFamily(font: string): string {
  return BUNDLED_FONTS.find(entry => entry.name === font)?.fontFamily ?? font;
}
