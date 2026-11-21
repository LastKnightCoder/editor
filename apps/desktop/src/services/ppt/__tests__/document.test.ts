import { migratePPT } from "../migrate";
import { describe, expect, it } from "vitest";
import { compilePPT, decodePPTFiles, encodePPTFiles, validatePPTSlide } from "../document";

const cover = '<section class="slide"><h1>回声 &amp; 节奏</h1></section>';
const rhythm = '<section class="slide"><p>听两拍\n\n再拍手。</p></section>';
const manifest = {
  format: "tau-ppt",
  version: 1,
  template: "cinematic-v1",
  title: "回声与节奏",
  slides: [
    { id: "opening", intent: "引入节奏" },
    { id: "rhythm", intent: "做节奏练习" },
  ],
};
const files = {
  "deck.json": JSON.stringify(manifest),
  "slides/opening.html": cover,
  "slides/rhythm.html": rhythm,
};

describe("PPT 正文", () => {
  it("页序可以独立调整，导出从清单中的新首页开始", () => {
    const reordered = {
      ...files,
      "deck.json": JSON.stringify({ ...manifest, slides: [...manifest.slides].reverse() }),
    };
    const reopened = decodePPTFiles(encodePPTFiles(reordered));
    expect(reopened).toEqual(reordered);
    const { html } = compilePPT(reopened!);
    const doc = new DOMParser().parseFromString(html, "text/html");
    expect(doc.title).toBe(manifest.title);
    expect([...doc.querySelectorAll(".slide")].map(page => page.textContent)).toEqual([
      "听两拍\n\n再拍手。",
      "回声 & 节奏",
    ]);
    expect(doc.querySelector(".slide.active")?.getAttribute("data-slide-id")).toBe("rhythm");
  });

  it("旧整稿可以交给原有读取路径", () => {
    expect(
      decodePPTFiles([
        {
          type: "code-block",
          language: "html",
          uuid: "old",
          children: [
            {
              type: "code-step",
              code: '<!DOCTYPE html><html><body><section class="slide">旧稿</section></body></html>',
              children: [{ type: "formatted", text: "" }],
            },
          ],
        },
      ])
    ).toBeNull();
  });

  it("缺少清单声明的页面会阻止发布", () => {
    expect(() =>
      compilePPT({ "deck.json": files["deck.json"], "slides/opening.html": cover })
    ).toThrow();
  });

  it("浏览器会自动补闭合的截断页面也要拒绝", () => {
    expect(() => validatePPTSlide("rhythm", '<section class="slide"><p>中断</p>')).toThrow();
  });
});

describe("旧稿首次续改", () => {
  const first = '<div class="slide active"><h1>保留封面</h1><div>嵌套内容</div></div>';
  const gap = "\n<!-- 章节切换 -->\n";
  const second = '<section class="slide"><h2>旧标题</h2></section>';
  const frame = (pages: string) =>
    "<!doctype html><html><head><title>教案</title><style>.slide{color:navy}</style></head><body><main>" +
    pages +
    "</main><footer>讲义</footer></body></html>";

  it("改第二页后可从正文还原原来的壳、夹注和未改页", () => {
    const files = migratePPT(frame(first + gap + second), "未命名");
    expect(files["slides/page-1.html"]).toBe(first);
    expect(files["slides/page-2.html"]).toBe(gap + second);
    files["slides/page-2.html"] = files["slides/page-2.html"].replace("旧标题", "新标题");
    const reopened = decodePPTFiles(encodePPTFiles(files));
    if (!reopened) throw Error("缺少结构化稿件");
    const { html } = compilePPT(reopened);
    const dom = new DOMParser().parseFromString(html, "text/html");
    expect([...dom.querySelectorAll("main > .slide")].map(page => page.textContent)).toEqual([
      "保留封面嵌套内容",
      "新标题",
    ]);
    expect(dom.querySelector("footer")?.textContent).toBe("讲义");
    expect(html).toContain(gap);
  });
  it.each([
    frame('<section class="slide">' + first + "</section>"),
    frame(first + "<aside>跨页图例</aside>" + second),
    frame(first + second).replace(
      "</body>",
      '<script>window.navigationMode="custom"</script></body>'
    ),
  ])("遇到不确定的页面归属或脚本时拒绝迁移", source => {
    expect(() => migratePPT(source, "教案")).toThrow();
  });
});
