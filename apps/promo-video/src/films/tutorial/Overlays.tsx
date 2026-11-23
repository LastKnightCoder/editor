/**
 * 教程片叠层（画面坐标）：右侧速查条、片尾前的速查表。键帽与字幕条在 kit/Overlays.tsx（功能片也用）。
 * 不用 backdrop-filter（多标签页并行渲染时偶发整层丢帧，产品片交接文档坑 24），底色都是不透明的。
 */
import { ease, progress } from "../../brand/motion";
import { fonts } from "../../brand/tokens";
import { Mixed } from "../../kit/Overlays";
import { useStage } from "../../kit/Stage";
import type { Timed } from "./run";

/** 右侧速查条：本章学过的语法逐条累积 */
export function CheatStrip({ chips, frame, x, top, until }: { chips: Timed<{ syntax: string; result: string }>[]; frame: number; x: number; top: number; until: number }) {
  const stage = useStage();
  const exit = 1 - progress(frame, until - 14, 14, ease.in);
  return (
    <div style={{ position: "absolute", left: x, top, display: "flex", flexDirection: "column", gap: 14, opacity: exit, zIndex: 30 }}>
      {chips
        .filter(c => c.at <= frame)
        .map(chip => {
          const t = progress(frame, chip.at, 18, ease.out);
          const glow = Math.max(0, 1 - (frame - chip.at) / 50);
          return (
            <div
              key={chip.at}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 14,
                padding: "10px 18px",
                borderRadius: 14,
                background: "#ffffff",
                boxShadow: `0 0 0 ${1 + glow}px color-mix(in srgb, ${stage.brand[0]} ${12 + 50 * glow}%, transparent), 0 10px 24px -16px rgba(22,34,49,0.4)`,
                opacity: t,
                transform: `translateX(${(1 - t) * 24}px)`,
              }}
            >
              <span style={{ fontSize: 22, fontWeight: 600, color: stage.brand[0] }}>
                <Mixed text={chip.value.syntax} />
              </span>
              <span style={{ fontFamily: fonts.caption, fontSize: 20, color: stage.ink3 }}>→</span>
              <span style={{ fontFamily: fonts.caption, fontSize: 22, color: stage.ink }}>{chip.value.result}</span>
            </div>
          );
        })}
    </div>
  );
}

/** 第 9 章速查表：整屏一张卡，四组语法逐行浮现，停住供截图 */
export function CheatSheet({ sheet, frame, at, out }: { sheet: { title: string; sub: string; groups: { name: string; rows: string[][] }[] }; frame: number; at: number; out: number }) {
  const stage = useStage();
  const enter = progress(frame, at + 6, 24, ease.out);
  const exit = progress(frame, out - 18, 18, ease.in);
  if (frame < at || frame >= out) return null;
  let row = 0;
  return (
    <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", zIndex: 60 }}>
      <div
        style={{
          width: 1560,
          padding: "52px 64px 56px",
          borderRadius: 28,
          background: "#ffffff",
          boxShadow: "0 0 0 1px rgba(22,34,49,0.06), 0 40px 90px -40px rgba(22,34,49,0.45)",
          opacity: enter * (1 - exit),
          transform: `translateY(${(1 - enter) * 24 - exit * 16}px) scale(${0.98 + 0.02 * enter})`,
        }}
      >
        <div style={{ textAlign: "center", fontFamily: fonts.display, fontWeight: 700, fontSize: 56, color: stage.ink, letterSpacing: "0.04em" }}>{sheet.title}</div>
        <div style={{ textAlign: "center", marginTop: 10, fontFamily: fonts.caption, fontSize: 24, color: stage.ink2, letterSpacing: "0.12em" }}>{sheet.sub}</div>
        <div style={{ marginTop: 44, display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 36 }}>
          {sheet.groups.map(group => (
            <div key={group.name}>
              <div style={{ fontFamily: fonts.caption, fontWeight: 600, fontSize: 24, color: stage.brand[0], paddingBottom: 12, borderBottom: "2px solid rgba(29,78,126,0.18)" }}>{group.name}</div>
              {group.rows.map(([syntax, result]) => {
                const t = progress(frame, at + 22 + row++ * 4, 18, ease.out);
                return (
                  <div key={syntax} style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 16, opacity: t, transform: `translateY(${(1 - t) * 8}px)` }}>
                    <span style={{ padding: "4px 10px", borderRadius: 8, background: "rgba(29,78,126,0.07)", fontSize: 22, fontWeight: 600, color: stage.brand[0], whiteSpace: "nowrap" }}>
                      <Mixed text={syntax} />
                    </span>
                    <span style={{ fontFamily: fonts.caption, fontSize: 22, color: stage.ink, whiteSpace: "nowrap" }}>{result}</span>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
