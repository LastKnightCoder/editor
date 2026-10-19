import { Img, staticFile } from "remotion";
import { fonts, palette } from "../brand/tokens";

/** 浅底上的品牌字标：小图标 + 衬线 Tau（不用深色底衬图标） */
export function Wordmark({ size = 56, color = palette.day.ink }: { size?: number; color?: string }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: size * 0.28 }}>
      <Img src={staticFile("tau-logo.png")} style={{ width: size * 1.05, height: size * 1.05, mixBlendMode: "multiply" }} />
      <span style={{ fontFamily: fonts.display, fontWeight: 700, fontSize: size, letterSpacing: "0.02em", color, lineHeight: 1 }}>Tau</span>
    </span>
  );
}
