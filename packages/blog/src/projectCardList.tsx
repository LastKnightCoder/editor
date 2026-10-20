import { useContext } from "react";
import { defineElement, defineExtension, type ElementRenderProps } from "@tau/editor";
import { DocumentCard, DocumentCardGrid } from "@tau/ui";
import type { PublishedProjectCardListNode } from "@tau/plugins/publish-data";
import { LinkContext } from "./contentLink";

function ProjectCardList({ attributes, children, element }: ElementRenderProps) {
  const { hrefFor } = useContext(LinkContext);
  const { items = [] } = element as unknown as PublishedProjectCardListNode;
  return (
    <div {...attributes}>
      {items.length ? (
        <DocumentCardGrid>
          {items.map(item => (
            <DocumentCard
              key={item.id}
              title={item.title}
              description={item.summary}
              href={hrefFor?.(item.target)}
            />
          ))}
        </DocumentCardGrid>
      ) : (
        <div contentEditable={false} style={{ userSelect: "none" }}>
          <p className="text-ink-3 py-6 text-center text-xs">暂无子文档</p>
        </div>
      )}
      {children}
    </div>
  );
}

export const projectCardListExtension = defineExtension({
  id: "tau.published-project-card-list",
  elements: [
    defineElement({
      type: "project-card-list",
      kind: "block",
      isVoid: true,
      render: ProjectCardList,
    }),
  ],
});
