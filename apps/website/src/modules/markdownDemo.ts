/** 写作区演示：逐字敲下 Markdown 语法，语法一完成就变成排好版的块 */
import { mustQuery, prefersReducedMotion, sleep } from "../lib/dom.ts";

interface DemoStep {
  syntax: string;
  text: string;
  render: (text: string) => string;
}

const STEPS: DemoStep[] = [
  { syntax: "# ", text: "一张安静的纸", render: t => `<h1>${t}</h1>` },
  {
    syntax: "> ",
    text: "环境不是背景，它参与思考。",
    render: t => `<blockquote>${t}</blockquote>`,
  },
  {
    syntax: "- [ ] ",
    text: "把手机放到另一个房间",
    render: t => `<div class="task"><i></i>${t}</div>`,
  },
  { syntax: "- [ ] ", text: "关掉所有通知", render: t => `<div class="task"><i></i>${t}</div>` },
  {
    syntax: "```js",
    text: "",
    render:
      () => `<div class="code"><header>JavaScript<svg class="i"><use href="#i-chev"/></svg></header><pre><em>1</em><span class="k">const</span> desk = <span class="f">clear</span>(<span class="s">"phone"</span>);
<em>2</em><span class="k">await</span> <span class="f">focus</span>(desk, { minutes: <span class="s">25</span> });</pre></div>`,
  },
];

const caret = () => Object.assign(document.createElement("span"), { className: "caret" });

async function run(doc: HTMLElement, keyHint: HTMLElement) {
  const typeInto = async (el: HTMLElement, text: string, delay: number) => {
    for (const ch of text) {
      el.append(ch);
      keyHint.textContent = ch === " " ? "空格" : ch;
      await sleep(delay);
    }
  };
  for (;;) {
    doc.innerHTML = "";
    for (const step of STEPS) {
      const line = document.createElement("div");
      line.className = "raw";
      const typed = document.createElement("span");
      line.append(typed, caret());
      doc.append(line);
      await typeInto(typed, step.syntax, 120);
      await sleep(260);
      line.outerHTML = step.render("");
      const block = doc.lastElementChild as HTMLElement;
      if (step.text) {
        const holder = document.createElement("span");
        const cursor = caret();
        block.append(holder, cursor);
        await typeInto(holder, step.text, 70);
        cursor.remove();
      }
      await sleep(420);
    }
    keyHint.textContent = "⌘ S";
    await sleep(3200);
  }
}

export function initMarkdownDemo() {
  const doc = mustQuery("#md-doc");
  const keyHint = mustQuery("#md-key");
  if (prefersReducedMotion()) {
    doc.innerHTML = STEPS.map(s => s.render(s.text)).join("");
    return;
  }
  // 滚到可见才开始，避免用户看到的时候已经播到一半
  const observer = new IntersectionObserver(
    ([entry]) => {
      if (!entry.isIntersecting) return;
      observer.disconnect();
      void run(doc, keyHint);
    },
    { threshold: 0.3 }
  );
  observer.observe(doc);
}
