/**
 * 按键回放的叠层（画面坐标）：键帽、底部字幕条。教程片与功能片共用。
 * 不用 backdrop-filter（多标签页并行渲染时偶发整层丢帧，产品片交接文档坑 24），底色都是不透明的。
 */
import type { CSSProperties } from "react";
import { ease, progress } from "../brand/motion";
import { fonts } from "../brand/tokens";
import type { KeyCap, Timed } from "./replay";
import { useStage } from "./Stage";

/** 记号用等宽，中文（「空格」「回车」）用字幕字体：等宽字体没有中文字形 */
export function Mixed({ text }: { text: string }) {
  return (
    <>
      {text.split(/([\p{Script=Han}]+)/u).map((part, i) =>
        part ? (
          <span key={i} style={{ fontFamily: /\p{Script=Han}/u.test(part) ? fonts.caption : fonts.label }}>
            {part}
          </span>
        ) : null
      )}
    </>
  );
}

/** 一组键帽：相隔不到 GROUP_GAP 帧的按键算同一组，停在给定位置；触发键染 accent；一组最多显示最近 GROUP_MAX 个 */
const GROUP_GAP = 50;
const GROUP_MAX = 5;
const HOLD = 70;

export function KeyCaps({ keys, frame, x, y }: { keys: KeyCap[]; frame: number; x: number; y: number }) {
  const stage = useStage();
  const shown = keys.filter(k => k.at <= frame);
  if (!shown.length) return null;
  let first = shown.length - 1;
  while (first > 0 && shown[first].at - shown[first - 1].at < GROUP_GAP) first--;
  const group = shown.slice(Math.max(first, shown.length - GROUP_MAX));
  const last = group[group.length - 1];
  const hold = last.slow ? HOLD * 2 : HOLD;
  const fade = 1 - progress(frame, last.at + hold, 16, ease.in);
  if (fade <= 0) return null;
  return (
    <div style={{ position: "absolute", left: x, top: y, display: "flex", gap: 12, opacity: fade, zIndex: 40 }}>
      {group.map((key, i) => {
        const pop = progress(frame, key.at, 10, ease.out);
        const press = key.trigger ? Math.max(0, 1 - Math.abs(frame - key.at - 3) / 14) : 0;
        const ring = key.slow ? progress(frame, key.at - 40, 30, ease.out) * (1 - progress(frame, key.at + 50, 20)) : 0;
        const wide = key.label.length > 1;
        const style: CSSProperties = {
          minWidth: wide ? 96 : 58,
          height: 58,
          padding: "0 18px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: 12,
          fontSize: wide ? 24 : 30,
          fontWeight: 600,
          color: key.trigger ? "#fff" : stage.ink,
          background: key.trigger ? stage.brand[0] : "#ffffff",
          boxShadow: key.trigger
            ? `0 ${4 - 3 * press}px 0 0 #123657, 0 12px 26px -10px rgba(29,78,126,0.6)`
            : `0 ${4 - 3 * press}px 0 0 rgba(22,34,49,0.16), 0 0 0 1px rgba(22,34,49,0.1), 0 10px 22px -12px rgba(22,34,49,0.35)`,
          transform: `translateY(${(1 - pop) * 10 + press * 3}px) scale(${0.9 + 0.1 * pop})`,
          opacity: pop,
          outline: ring > 0 ? `${3 * ring}px solid color-mix(in srgb, ${stage.brand[1]} ${90 * ring}%, transparent)` : undefined,
          outlineOffset: 6,
        };
        return (
          <span key={i} style={style}>
            <Mixed text={key.label} />
          </span>
        );
      })}
    </div>
  );
}

/** 字幕里的记号（`##`、`⌘⇧T`）用等宽 + accent */
function CaptionText({ text }: { text: string }) {
  const stage = useStage();
  return (
    <>
      {text.split(/([#>*~=`$_\-⌘⇧⌫⌃⌥⏎]+[\w.]*|1\.)/u).map((part, i) =>
        i % 2 ? (
          <span key={i} style={{ fontFamily: fonts.label, color: stage.brand[0], fontWeight: 600, padding: "0 2px" }}>
            {part}
          </span>
        ) : (
          part
        )
      )}
    </>
  );
}

/** 底部字幕条：新字幕淡入，上一条同时淡出；until 之后不再显示 */
export function CaptionBar({ captions, frame, until }: { captions: Timed<string>[]; frame: number; until: number }) {
  const stage = useStage();
  const index = captions.findLastIndex(c => c.at <= frame);
  if (index < 0 || frame >= until) return null;
  const items = [captions[index - 1], captions[index]].filter(Boolean) as Timed<string>[];
  const exit = 1 - progress(frame, until - 14, 14, ease.in);
  return (
    <>
      {items.map((cue, i) => {
        const current = i === items.length - 1;
        // 空字幕：收起字幕条（画面底部有要点的东西时用）
        if (!cue.value) return null;
        const t = current ? progress(frame, cue.at, 16) : 1 - progress(frame, captions[index].at, 10);
        if (t <= 0) return null;
        return (
          <div
            key={cue.at}
            style={{
              position: "absolute",
              left: "50%",
              bottom: 60,
              transform: `translate(-50%, ${(1 - t) * (current ? 10 : -6)}px)`,
              opacity: t * exit,
              padding: "14px 34px",
              borderRadius: 999,
              background: "rgba(252, 253, 255, 0.97)",
              boxShadow: "0 0 0 1px rgba(22,34,49,0.06), 0 14px 36px -14px rgba(22,34,49,0.35)",
              fontFamily: fonts.caption,
              fontSize: 32,
              letterSpacing: "0.03em",
              color: stage.ink,
              whiteSpace: "nowrap",
              zIndex: 50,
            }}
          >
            <CaptionText text={cue.value} />
          </div>
        );
      })}
    </>
  );
}
