import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { SCALE_WORDS, cn } from "../cn";

// 尺度词的单一事实源：:root 字面值在 tokens.css，Tailwind 词表映射在 tailwind.css
const css = ["tokens.css", "tailwind.css"]
  .map(file => readFileSync(resolve(import.meta.dirname, "../../../themes/src", file), "utf-8"))
  .join("\n");

/** 抽取某前缀下声明的尺度词（去掉前缀）：--text-tau-meta → tau-meta */
function declaredWords(varPrefix: string): string[] {
  const matches = [...css.matchAll(new RegExp(`${varPrefix}([a-z0-9-]+?):`, "g"))];
  const words = matches.map(m => m[1]).filter(word => !word.includes("--"));
  return [...new Set(words)].sort();
}

const sorted = (words: readonly string[]) => [...words].sort();

/**
 * 守护 cn 的尺度词表与 tokens.css 同步：漏登记的词会被 tailwind-merge 归错组，
 * 与语义色互删（如 text-tau-meta 被 text-ink-2 吃掉）——静默丢样式，故用测试锁住。
 */
describe("cn 尺度词表与 tokens.css 一致", () => {
  it("字号词", () => {
    expect(sorted(SCALE_WORDS.fontSize)).toEqual(declaredWords("--text-"));
  });
  it("字族词", () => {
    expect(sorted(SCALE_WORDS.fontFamily)).toEqual(declaredWords("--font-"));
  });
  it("圆角词", () => {
    expect(sorted(SCALE_WORDS.radius)).toEqual(declaredWords("--radius-"));
  });
  it("阴影词", () => {
    expect(sorted(SCALE_WORDS.shadow)).toEqual(declaredWords("--shadow-"));
  });
  it("缓动词", () => {
    expect(sorted(SCALE_WORDS.ease)).toEqual(declaredWords("--ease-"));
  });
  it("动效词", () => {
    expect(sorted(SCALE_WORDS.animate)).toEqual(declaredWords("--animate-"));
  });
});

describe("cn 合并语义", () => {
  it("调用方 className 覆盖组件默认尺寸", () => {
    expect(cn("grid size-[30px]", "size-[27px]")).toBe("grid size-[27px]");
  });

  it("调用方 className 覆盖组件默认对齐", () => {
    expect(cn("flex flex-wrap items-start gap-4", "items-center")).toBe(
      "flex flex-wrap gap-4 items-center"
    );
  });

  it("字号词与语义色词共存时都不被删", () => {
    expect(cn("text-tau-title-lg text-ink-1 font-[650]")).toBe(
      "text-tau-title-lg text-ink-1 font-[650]"
    );
  });

  it("字族词与字重词（同为 font- 前缀）不相残", () => {
    expect(cn("font-tau-mono text-tau-micro text-ink-3", "font-[600]")).toBe(
      "font-tau-mono text-tau-micro text-ink-3 font-[600]"
    );
  });

  it("圆角/阴影/缓动/动效的同类覆盖取后者", () => {
    expect(cn("rounded-tau-sm", "rounded-[7px]")).toBe("rounded-[7px]");
    expect(cn("shadow-card", "shadow-float")).toBe("shadow-float");
    expect(cn("ease-tau-out", "ease-out")).toBe("ease-out");
    expect(cn("animate-hm-pulse", "animate-pulse")).toBe("animate-pulse");
  });
});
