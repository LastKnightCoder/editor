import { afterEach, describe, expect, it } from "vitest";
import { extractPage, pageAsPrompt, readBlocks } from "../content/page/extract";

afterEach(() => {
  document.body.innerHTML = "";
});

const long = (label: string) => `${label} ${"文字".repeat(60)}`;

describe("extractPage", () => {
  it("取正文容器里的最内层块，跳过导航与页脚，按顺序编号", () => {
    document.body.innerHTML = `
      <nav><p>菜单</p></nav>
      <article>
        <h1>标题</h1>
        <p>${long("第一段")}</p>
        <ul><li><p>${long("列表里的段")}</p></li></ul>
        <aside><p>旁注</p></aside>
        <p>${long("第三段")}</p>
      </article>
      <footer><p>版权</p></footer>`;
    const page = extractPage(document);
    expect(page.blocks.map(block => block.text.split(" ")[0])).toEqual([
      "标题",
      "第一段",
      "列表里的段",
      "第三段",
    ]);
    expect(page.blocks.map(block => block.index)).toEqual([1, 2, 3, 4]);
  });

  it("给模型的正文带 [n]，超长截断并提示用 read_page", () => {
    document.body.innerHTML = `<article>${Array.from({ length: 30 }, (_, i) => `<p>${long(`段${i + 1}`)}</p>`).join("")}</article>`;
    const page = extractPage(document);
    const prompt = pageAsPrompt(page, 1000);
    expect(prompt.startsWith("[1] 段1")).toBe(true);
    expect(prompt).toContain("read_page");
    expect(readBlocks(page, 29, 99).split("\n\n")).toHaveLength(2);
    expect(readBlocks(page, 50)).toBe("没有这些段落");
  });
});
