import { useState } from "react";
import { Button } from "@tau/ui";
import { defineEditorElement, defineEditorExtension, definePlugin } from "@tau/plugins";

declare const __AUTHOR_LABEL__: string;
declare const __AUTHOR_VERSION__: string;

interface CounterNode {
  type: "spike.interactive-counter";
  initial: number;
  children: { type: "formatted"; text: string }[];
}
declare module "@tau/plugins" {
  interface EditorElementMap {
    "spike.interactive-counter": CounterNode;
  }
}

function Counter({ initial }: { initial: number }) {
  const [count, setCount] = useState(initial);
  return (
    <section className="spike-counter" contentEditable={false} data-plugin-content>
      <span data-plugin-label>{__AUTHOR_LABEL__}</span>
      <output data-count={count}>{count}</output>
      <Button
        onMouseDown={event => event.preventDefault()}
        onClick={() => setCount(value => value + 1)}
      >
        增加
      </Button>
    </section>
  );
}

// 桌面与博客读取同一个导出，不维护第二个渲染入口。
export const editorExtensions = [
  defineEditorExtension({
    id: "spike.counter-extension",
    elements: [
      defineEditorElement<CounterNode>({
        type: "spike.interactive-counter",
        kind: "block",
        isVoid: true,
        render: ({ attributes, children, element }) => (
          <div {...attributes}>
            <Counter initial={element.initial} />
            {children}
          </div>
        ),
      }),
    ],
  }),
];

export const reactUseState = useState;
export default definePlugin({
  id: "spike.counter",
  name: "发布渲染验证",
  version: __AUTHOR_VERSION__,
  create: () => ({
    activate() {
      const state = globalThis as typeof globalThis & { desktopActivations?: number };
      state.desktopActivations = (state.desktopActivations ?? 0) + 1;
    },
  }),
});
