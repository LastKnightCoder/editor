import { createEditor, Editor, Node, Transforms, type Descendant, type Point } from "slate";
import { withHistory } from "slate-history";
import { expect, it } from "vitest";
import { wrapContentLink } from "../utils";
import { wrapLink } from "@tau/editor/extensions/link";
import { wrapUnderline } from "@tau/editor/extensions/underline";
import { wrapStyledText } from "@tau/editor/extensions/styled-text";
import { wrapKbd } from "@tau/editor/extensions/kbd";
import { wrapComment } from "@tau/editor/extensions/comment";

const actions: [string, (editor: Editor) => void][] = [
  ["content-link", editor => wrapContentLink(editor, 11, "card", "标题", 22)],
  ["link", editor => wrapLink(editor, "example.com")],
  ["underline", wrapUnderline],
  ["styled-text", wrapStyledText],
  ["kbd", wrapKbd],
  ["comment", wrapComment],
];

const marks = [
  { bold: true },
  { italic: true, color: "red" },
  {},
  { highlight: "yellow", tag: "批次" },
] as const;
const chars = "甲乙丙丁戊己庚辛壬癸";
const leafLength = 4;

function paragraph(block: number, size: number): Descendant {
  return {
    type: "paragraph",
    children: Array.from({ length: size }, (_, i) => ({
      type: "formatted",
      text: chars[(block + i) % chars.length].repeat(leafLength),
      ...marks[i % marks.length],
    })),
  };
}

it.skipIf(process.env.TAU_INLINE_STRESS !== "1").each([
  { scenario: "混合格式连续转换", blocks: 3, size: 12, cycles: 360 },
  { scenario: "单段密集格式", blocks: 1, size: 1024, cycles: 6 },
  { scenario: "长文档末尾跨段", blocks: 10000, size: 4, cycles: 6 },
])(
  "$scenario",
  async ({ scenario, blocks, size, cycles }) => {
    const editor = withHistory(createEditor());
    editor.isInline = element => actions.some(([type]) => type === element.type);
    const original = Array.from({ length: blocks }, (_, block) => paragraph(block, size));
    editor.children = original;
    const times: number[] = [];
    const blockLength = size * leafLength;
    for (let cycle = 0; cycle < cycles; cycle++) {
      const [type, apply] = actions[cycle % actions.length];
      const firstBlock = blocks > 3 ? blocks - 3 : cycle % blocks;
      const lastBlock = Math.min(firstBlock + 2, blocks - 1);
      const start = (cycle * 7) % (blockLength / 2);
      const end = blockLength - ((cycle * 11) % (blockLength / 2));
      const point = (block: number, offset: number): Point => {
        const leaf = Math.min(Math.floor(offset / leafLength), size - 1);
        return { path: [block, leaf], offset: offset - leaf * leafLength };
      };
      const from = point(firstBlock, start);
      const to = point(lastBlock, end);
      Transforms.select(
        editor,
        cycle % 2 ? { anchor: to, focus: from } : { anchor: from, focus: to }
      );
      const before = performance.now();
      apply(editor);
      times.push(performance.now() - before);

      for (let block = firstBlock; block <= lastBlock; block++) {
        const contents = Node.get(editor, [block]);
        let offset = 0;
        for (const [leaf, path] of Node.texts(contents)) {
          const wrapped = path.length > 1 && Node.parent(contents, path).type === type;
          const format = Node.extractProps(leaf);
          for (const char of leaf.text) {
            const i = Math.floor(offset / leafLength);
            const selected =
              (block !== firstBlock || offset >= start) && (block !== lastBlock || offset < end);
            expect(wrapped).toBe(selected);
            expect(char).toBe(chars[(block + i) % chars.length]);
            expect(format).toEqual({ type: "formatted", ...marks[i % marks.length] });
            offset++;
          }
        }
        expect(offset).toBe(blockLength);
      }
      const converted = editor.children;
      editor.undo();
      expect(editor.children).toEqual(original);
      editor.redo();
      expect(editor.children).toEqual(converted);
      editor.undo();
      await Promise.resolve();
    }
    times.sort((a, b) => a - b);
    console.info(scenario, {
      cycles,
      p50Ms: times[Math.floor(cycles / 2)],
      maxMs: times[cycles - 1],
    });
  },
  120000
);
