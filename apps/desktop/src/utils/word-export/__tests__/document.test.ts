import { describe, expect, it } from "vitest";
import { readWordPackage } from "./read-word-package";
import { buildWordDocument } from "../document";
import { DEFAULT_WINDOW_FONT } from "../../../../shared/window-font";

async function exportHtml(html: string) {
  const result = await buildWordDocument(html, "文档", DEFAULT_WINDOW_FONT, async () => {
    throw new Error("图片不可用");
  });
  return { ...(await readWordPackage(result.bytes)), warnings: result.warnings };
}
const word = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";

describe("Word 静态内容转换", () => {
  it("连续同色高亮只在两端留白，变色后分段并保留加粗", async () => {
    const { document } = await exportHtml(
      '<p>前<mark class="highlight-blue">甲</mark><span style="color:#112233"><mark class="highlight-blue"><strong>乙</strong></mark></span><mark class="highlight-green">丙</mark>后</p>'
    );
    const p = Array.from(document.getElementsByTagNameNS(word, "p")).find(
      p => p.textContent === "前\u00a0甲乙\u00a0\u00a0丙\u00a0后"
    );
    const fills = Array.from(p?.getElementsByTagNameNS(word, "shd") ?? [], shading =>
      shading.getAttributeNS(word, "fill")
    );
    expect(fills).toHaveLength(3);
    expect(fills[0]).toEqual(fills[1]);
    expect(fills[2]).not.toEqual(fills[0]);
    expect(p?.getElementsByTagNameNS(word, "b").length).toBeGreaterThan(0);
  });

  it("合并格保留行列跨度和后续单元格的位置", async () => {
    const { document } = await exportHtml(
      "<table><tr><td rowspan='2' colspan='2'>甲</td><td>乙</td></tr><tr><td>丙</td></tr></table>"
    );
    const rows = Array.from(document.getElementsByTagNameNS(word, "tr"));
    const cells = rows.map(row => Array.from(row.getElementsByTagNameNS(word, "tc")));
    expect(cells.map(row => row.map(cell => cell.textContent))).toEqual([
      ["甲", "乙"],
      ["", "丙"],
    ]);
    expect(
      cells.map(row =>
        row[0].getElementsByTagNameNS(word, "gridSpan")[0].getAttributeNS(word, "val")
      )
    ).toEqual(["2", "2"]);
    expect(
      cells.map(row => row[0].getElementsByTagNameNS(word, "vMerge")[0].getAttributeNS(word, "val"))
    ).toEqual(["restart", "continue"]);
  });

  it("子列表退出后继续父列表编号，新列表独立起算", async () => {
    const { document } = await exportHtml(
      "<ol><li>甲<ol><li>乙</li></ol></li><li>丙</li></ol><ol><li>丁</li></ol>"
    );
    const markers = Array.from(document.getElementsByTagNameNS(word, "numPr"));
    const ids = markers.map(m =>
      m.getElementsByTagNameNS(word, "numId")[0].getAttributeNS(word, "val")
    );
    expect(
      markers.map(m => m.getElementsByTagNameNS(word, "ilvl")[0].getAttributeNS(word, "val"))
    ).toEqual(["0", "1", "0", "0"]);
    expect(ids[0]).toEqual(ids[2]);
    expect(ids[3]).not.toEqual(ids[0]);
  });

  it("列表中的代码块随层级内缩，离开列表后恢复正文宽度", async () => {
    const { document } = await exportHtml(
      "<ol><li>步骤<pre>outer()</pre><ul><li>细节<pre>inner()</pre></li></ul></li></ol><pre>outside()</pre>"
    );
    const geometry = Array.from(document.getElementsByTagNameNS(word, "tbl"), table => {
      const metric = (key: string) =>
        Number(table.getElementsByTagNameNS(word, key)[0].getAttributeNS(word, "w"));
      const cellPadding = table
        .getElementsByTagNameNS(word, "tcMar")[0]
        .getElementsByTagNameNS(word, "left")[0];
      expect(Number(cellPadding.getAttributeNS(word, "w"))).toBe(0);
      const textInset = table.getElementsByTagNameNS(word, "ind")[0];
      expect(Number(textInset.getAttributeNS(word, "left"))).toBeGreaterThan(0);
      return { left: metric("tblInd"), width: metric("tblW") };
    });
    const [outer, inner, outside] = geometry;
    expect(outside.left).toBe(0);
    expect(outer.left).toBeGreaterThan(outside.left);
    expect(inner.left).toBeGreaterThan(outer.left);
    for (const box of [outer, inner]) expect(box.left + box.width).toBe(outside.width);
  });

  it("同一级列表项的高亮底色与代码块共用左右边界，列表外的高亮恢复通栏", async () => {
    const { document } = await exportHtml(
      '<ul><li>说明<div class="highlight-block"><p>提示</p></div><pre>code</pre></li></ul><div class="highlight-block"><p>结语</p></div>'
    );
    const geometry = Array.from(document.getElementsByTagNameNS(word, "tbl"), table => {
      const indent = Number(
        table.getElementsByTagNameNS(word, "tblInd")[0].getAttributeNS(word, "w")
      );
      const cells = table.getElementsByTagNameNS(word, "tc");
      expect(Array.from(cells, cell => cell.textContent)).not.toContain("");
      const width = Number(table.getElementsByTagNameNS(word, "tblW")[0].getAttributeNS(word, "w"));
      return { left: indent, right: indent + width };
    });
    const [highlight, code, standalone] = geometry;
    expect(highlight).toEqual(code);
    expect(highlight.left).toBeGreaterThan(standalone.left);
    expect(highlight.right).toBe(standalone.right);
  });

  it("同一单元格或列表项的两段文字分开排版，续段不重复编号", async () => {
    for (const html of [
      "<table><tr><td><p>甲</p><p>乙</p></td></tr></table>",
      "<ul><li><p>甲</p><p>乙</p></li></ul>",
      '<div class="callout"><p>甲</p><ul><li>乙</li></ul><p>丙</p></div>',
    ]) {
      const { document } = await exportHtml(html);
      const paragraphs = Array.from(document.getElementsByTagNameNS(word, "p"));
      for (const text of ["乙", "丙"]) {
        const p = paragraphs.find(item => item.textContent === text);
        if (text === "丙" && !html.includes(text)) continue;
        const gap = p?.previousElementSibling;
        expect(gap?.textContent).toBe("");
        expect(
          Number(gap?.getElementsByTagNameNS(word, "spacing")[0]?.getAttributeNS(word, "line"))
        ).toBeGreaterThan(0);
      }
      expect(document.getElementsByTagNameNS(word, "numPr")).toHaveLength(
        html.includes("<li>") ? 1 : 0
      );
    }
  });

  it("插件静态片段中的链接、代码换行和失效图片说明随正文保留", async () => {
    const { document, relationships, warnings } = await exportHtml(
      '<section><a href="https://example.org/read">原文</a><pre><code><span class="line">const <span>http</span> = require();</span><span class="line"></span><span class="line">  two</span></code></pre><img src="missing" alt="图一"></section>'
    );
    expect(document.getElementsByTagNameNS(word, "hyperlink")[0].textContent).toBe("原文");
    expect(
      Array.from(relationships.documentElement.children).some(
        e => e.getAttribute("Target") === "https://example.org/read"
      )
    ).toBe(true);
    const codeCell = document.getElementsByTagNameNS(word, "tc")[0];
    const lines = Array.from(codeCell.getElementsByTagNameNS(word, "p"));
    expect(lines.map(p => p.textContent)).toEqual(["const http = require();", "", "  two"]);
    expect(warnings).toEqual(["图一"]);
    expect(document.documentElement.textContent).toContain("图一");
  });
});
