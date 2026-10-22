import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 移动端不自带主题：颜色只消费 @tau/themes 的 --tau-* 与其 Tailwind 语义类。
 * 这里扫描源码，防止旧的移动端主题变量 / 类名或自建主题块回流。
 */
const SRC = resolve(import.meta.dirname, "../..");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === "__tests__" ? [] : sourceFiles(path);
    return /\.(tsx?|css)$/.test(name) ? [path] : [];
  });
}

const LEGACY_VARS =
  /(?<![\w-])--(bg-(page|surface|elevated|input|press)|ghost-press|meta-ink|ink-[123]|line-[12]|hairline|brand(-[\w]+)?|(sage|sky|apricot|lilac|butter|rose)(-soft)?|ok|warn|danger|mask|shadow-(card|float|accent)(-raw)?|toast-(bg|fg)|texture-noise|glow-ambient|mono-font|font|th-[\w-]+)(?![\w-])/;
// 不含 divide-：编辑器分割线元素类型就叫 divide-line
const LEGACY_CLASSES =
  /(?<![\w-])(bg|text|border|ring|decoration|fill|stroke|from|via|to|outline)-(elevated|input|ghost-press|ink|meta-ink|line|line-soft|accent-strong|(sage|sky|apricot|lilac|butter|rose)(-soft)?|mask)(?![\w-])|(?<![\w-])shadow-accent(?![\w-])/;
const OWN_THEME = /\[data-theme=|(?<![\w(-])--tau-[\w-]+\s*:/;

describe("移动端主题词汇", () => {
  const files = sourceFiles(SRC);

  it.each([
    ["旧主题变量", LEGACY_VARS],
    ["旧主题类名", LEGACY_CLASSES],
    ["自建主题块或重定义 --tau-*", OWN_THEME],
  ])("不出现%s", (_label, pattern) => {
    const hits = files.flatMap(file =>
      readFileSync(file, "utf8")
        .split("\n")
        .flatMap((line, index) =>
          pattern.test(line) ? [`${relative(SRC, file)}:${index + 1}  ${line.trim()}`] : []
        )
    );
    expect(hits).toEqual([]);
  });
});
