import React, { useSyncExternalStore } from "react";
import { RenderElementProps, useReadOnly, useSlateStatic } from "slate-react";
import { cn } from "@tau/ui";
import { InlineChromiumBugfix } from "@tau/editor/api";

import { type LinkElement } from "../types.ts";
import { linkPanelOf } from "../panel/controller.ts";
import { useOpenLink } from "../panel/openLink.ts";

interface LinkProps {
  attributes: RenderElementProps["attributes"];
  element: LinkElement;
}

/** accent 字色 + 淡下划线；悬停或浮层打开时下划线变实色 */
const LINK =
  "rounded-[3px] text-[var(--ed-accent-text)] underline decoration-1 underline-offset-[3px] " +
  "decoration-[color:color-mix(in_srgb,var(--ed-accent)_38%,transparent)] " +
  "transition-[color,text-decoration-color,background-color] duration-300 " +
  "hover:decoration-[color:var(--ed-accent)] in-data-[link-mod]:cursor-pointer";
const LINK_ACTIVE = "decoration-[color:var(--ed-accent)]";
const LINK_EDITING = "bg-[var(--ed-accent-soft)] decoration-[color:var(--ed-accent)]";

const Link: React.FC<React.PropsWithChildren<LinkProps>> = ({ attributes, children, element }) => {
  const readOnly = useReadOnly();
  const editor = useSlateStatic();
  const controller = linkPanelOf(editor);
  const openLink = useOpenLink();

  const panelMode = useSyncExternalStore(controller.subscribe, () => {
    const state = controller.getState();
    return "element" in state && state.element === element ? state.mode : null;
  });

  return (
    <a
      {...attributes}
      href={element.url}
      className={cn(
        LINK,
        readOnly && "cursor-pointer",
        panelMode === "view" && LINK_ACTIVE,
        panelMode === "edit" && LINK_EDITING
      )}
      onClick={e => {
        e.preventDefault();
        // 编辑态单击只放光标，⌘/Ctrl 点击才打开
        if (readOnly || e.metaKey || e.ctrlKey) openLink(element.url);
      }}
      onMouseEnter={e => !readOnly && controller.hoverEnter(element, e.clientY)}
      onMouseMove={e => !readOnly && controller.hoverMove(element, e.clientY)}
      onMouseLeave={() => !readOnly && controller.hoverLeave(element)}
    >
      <InlineChromiumBugfix />
      {children}
      <InlineChromiumBugfix />
    </a>
  );
};

export default Link;
