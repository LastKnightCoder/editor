import { expect, it } from "vitest";
import { scopeContentCss } from "./content-css";

it("正文和关键帧按实例隔离，关键帧内部选择器保持有效", () => {
  const css =
    ":root { --color: red } .box { animation: pulse 1s } @keyframes pulse { from { opacity: 0 } to { opacity: 1 } }";
  const first = scopeContentCss(css, '[data-published-content="a"]');
  const second = scopeContentCss(css, '[data-published-content="b"]');
  expect(first).toContain('[data-published-content="a"] .box');
  expect(first).not.toContain('[data-published-content="a"] from');
  expect(first).not.toContain("animation: pulse 1s");
  expect(first).not.toBe(second);
  expect(
    scopeContentCss(".box { &:hover { color: red } }", '[data-published-content="a"]')
  ).toContain("&:hover");
});
