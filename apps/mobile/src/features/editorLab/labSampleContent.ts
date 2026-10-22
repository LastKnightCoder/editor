import type { Descendant } from "slate";

function text(value: string) {
  return { type: "formatted", text: value };
}

function paragraph(value: string) {
  return { type: "paragraph", children: [text(value)] };
}

const SAMPLE_CONTENT = [
  { type: "header", level: 1, children: [text("编辑器实验样稿")] },
  paragraph(
    "这是一段用于验证移动端编辑体验的示例正文。阅读状态下双击任意文字，应在同一次手势内切换为编辑状态，并把光标放在双击的位置，同时弹出软键盘。请留意光标是否准确落在手指附近。"
  ),
  paragraph(
    "键盘弹出后，测量条会实时显示键盘高度与可视视口高度。切换输入法、展开候选栏或者切换到表情面板时，键盘高度会发生变化，这些变化都会写进日志，方便对比原生注入值与视口推算值。"
  ),
  { type: "header", level: 2, children: [text("待办与链接")] },
  {
    type: "check-list",
    children: [
      {
        type: "check-list-item",
        checked: true,
        children: [paragraph("已完成：在阅读态点击勾选框，观察是否切换")],
      },
      {
        type: "check-list-item",
        checked: false,
        children: [paragraph("未完成：在阅读态点击勾选框，观察是否切换")],
      },
    ],
  },
  {
    type: "paragraph",
    children: [
      text("阅读态点击这个"),
      { type: "link", url: "https://example.com", children: [text("示例链接")] },
      text("，观察是否打开或被拦截。"),
    ],
  },
  { type: "header", level: 2, children: [text("长文滚动")] },
  paragraph(
    "下面几段文字用于把正文撑过一屏。滚动到底部再双击靠下的文字，可以检查键盘弹出后光标所在行是否被自动滚动到可见区域，以及页面容器高度变化时正文是否发生跳动。"
  ),
  paragraph(
    "移动端的软键盘在不同系统上的行为差异很大：安卓会缩小布局视口或只缩小可视视口，苹果系统则通常保持布局视口不变，只把可视视口上推。实验页自己计算容器高度，以便在两种行为下都能拿到稳定的读数。"
  ),
  paragraph(
    "当输入法处于组合输入状态时，任何焦点切换都可能导致已输入的拼音丢失。后续实验会在这里验证面板与键盘的互换，请在组合输入过程中尝试切换，记录是否丢字。"
  ),
  paragraph(
    "最后一段：尝试在这段文字的末尾双击，检查光标是否落在段末，以及键盘弹出后这段文字是否仍然可见，没有被键盘遮挡。"
  ),
];

/** 每次返回独立副本，避免多个编辑器实例共享节点对象 */
export function createLabSampleContent(): Descendant[] {
  return JSON.parse(JSON.stringify(SAMPLE_CONTENT)) as Descendant[];
}
