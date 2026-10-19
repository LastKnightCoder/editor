import type { CSSProperties, ReactNode } from "react";
import { fonts, palette } from "../brand/tokens";

/** 漂浮的纸片：碎片、卡片的统一外观 */
export function Paper({ label, children, width = 320, style }: { label?: string; children: ReactNode; width?: number; style?: CSSProperties }) {
  return (
    <div
      style={{
        width,
        padding: "18px 22px 20px",
        borderRadius: 16,
        background: palette.day.paper,
        boxShadow: "0 0 0 1px rgba(22,34,49,0.06), 0 2px 6px -2px rgba(22,34,49,0.10), 0 28px 50px -24px rgba(22,34,49,0.35)",
        fontFamily: fonts.ui,
        color: palette.day.ink,
        ...style,
      }}
    >
      {label && (
        <div
          style={{
            fontFamily: fonts.label,
            fontSize: 12,
            letterSpacing: "0.14em",
            color: palette.day.ink3,
            marginBottom: 10,
          }}
        >
          {label}
        </div>
      )}
      {children}
    </div>
  );
}
