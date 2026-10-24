import { useState } from "react";
import { Button } from "@tau/ui";
import { definePlugin, defineEditorElement, defineEditorExtension } from "@tau/plugins";

interface PortableCounterElement {
  type: "example.portable-counter";
  initial: number;
  children: { type: "formatted"; text: string }[];
}

declare module "@tau/plugins" {
  interface EditorElementMap {
    "example.portable-counter": PortableCounterElement;
  }
}

function Counter({ initial }: { initial: number }) {
  const [count, setCount] = useState(initial);
  return (
    <section className="portable-counter" contentEditable={false} data-portable-counter>
      <output>{count}</output>
      <Button
        onMouseDown={event => event.preventDefault()}
        onClick={() => setCount(value => value + 1)}
      >
        增加
      </Button>
    </section>
  );
}

function CounterIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
    >
      <rect x="3" y="3" width="18" height="18" rx="3" />
      <path d="M7 12h10M12 7v10" />
    </svg>
  );
}

export default definePlugin({
  id: "example.portable-counter",
  name: "可发布计数块",
  version: "1.0.0",
  editorExtensions: [
    defineEditorExtension({
      id: "example.portable-counter",
      blockPanel: [
        {
          icon: CounterIcon,
          title: "可发布计数块",
          keywords: ["counter", "计数", "发布"],
          description: "与博客共用同一扩展的交互块",
          onClick: editor =>
            editor.insertNode({
              type: "example.portable-counter",
              initial: 7,
              children: [{ type: "formatted", text: "" }],
            }),
        },
      ],
      elements: [
        defineEditorElement<PortableCounterElement>({
          type: "example.portable-counter",
          kind: "block",
          isVoid: true,
          render: ({ attributes, element, children }) => (
            <div {...attributes}>
              <Counter initial={element.initial} />
              {children}
            </div>
          ),
        }),
      ],
    }),
  ],
  editorMetrics: [{ type: "example.portable-counter", textFields: [] }],
  editorCodecs: [
    {
      type: "example.portable-counter",
      isVoid: true,
      directives: {
        "portable-counter": attributes => ({
          type: "example.portable-counter",
          initial: Number(attributes.value) || 0,
          children: [{ type: "formatted", text: "" }],
        }),
      },
      serializer: { toMarkdown: element => `::portable-counter{value=${element.initial}}` },
    },
  ],
});
