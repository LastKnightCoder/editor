/**
 * 对话消息上的「引用」：插到最近在写的正文（行内引用 / 摘录块），或复制引用链接。
 * 菜单打开时才判断有没有可写正文；没有时只剩复制链接。
 * 打开菜单前在这条回答里选中了文字，摘录块就引用选中的这段，否则引用整条回答。
 */

import { useRef, useState } from "react";
import { Link2, Quote, TextQuote, CornerDownLeft } from "lucide-react";
import { IconButton, Menu, toast } from "@tau/ui";
import type { ChatRefPayload } from "../types";
import { copyChatRefLink } from "../link";
import {
  activeWritableEditor,
  insertChatRefIntoActiveEditor,
  type ChatRefInsertMode,
} from "../operations";

export function ChatRefMenu({
  getPayload,
  quoteText,
}: {
  getPayload: () => ChatRefPayload | null;
  /** 这条回答的正文：「作为摘录块」时作为引文 */
  quoteText: string;
}) {
  const [writable, setWritable] = useState(false);
  const [selection, setSelection] = useState("");
  const anchorRef = useRef<HTMLButtonElement>(null);

  /** 选区落在这条消息里才算（菜单按钮所在的消息容器） */
  const readSelection = () => {
    const current = window.getSelection();
    const text = current?.toString().trim() ?? "";
    const message = anchorRef.current?.closest(".group\\/msg");
    if (!text || !current?.rangeCount || !message) return "";
    return message.contains(current.getRangeAt(0).commonAncestorContainer) ? text : "";
  };

  const run = (mode: ChatRefInsertMode) => {
    const payload = getPayload();
    if (!payload) {
      toast.warning("这条消息还没有保存，稍后再引用");
      return;
    }
    const text = selection || quoteText;
    void insertChatRefIntoActiveEditor(
      mode === "quote" ? { ...payload, text } : payload,
      mode
    ).catch(() => toast.error("引用失败"));
  };
  const copy = () => {
    const payload = getPayload();
    if (!payload) {
      toast.warning("这条消息还没有保存，稍后再引用");
      return;
    }
    void copyChatRefLink(payload)
      .then(() => toast.success("已复制引用链接"))
      .catch(() => toast.error("复制失败"));
  };

  return (
    <Menu
      align="start"
      onOpenChange={open => {
        if (!open) return;
        setWritable(Boolean(activeWritableEditor()));
      }}
      trigger={
        <IconButton
          ref={anchorRef}
          aria-label="引用到正文"
          title="引用到正文"
          className="size-[26px] [&_svg]:size-3.5"
          // 点击会清掉选区，按下时先记下来
          onPointerDown={() => setSelection(readSelection())}
        >
          <Quote strokeWidth={1.75} />
        </IconButton>
      }
    >
      {writable && (
        <>
          <Menu.Item
            icon={<CornerDownLeft size={14} strokeWidth={1.75} />}
            onSelect={() => run("inline")}
          >
            插入到正文
          </Menu.Item>
          {(selection || quoteText.trim()) && (
            <Menu.Item
              icon={<TextQuote size={14} strokeWidth={1.75} />}
              onSelect={() => run("quote")}
            >
              {selection ? "摘录选中的文字" : "作为摘录块插入"}
            </Menu.Item>
          )}
          <Menu.Separator />
        </>
      )}
      <Menu.Item icon={<Link2 size={14} strokeWidth={1.75} />} onSelect={copy}>
        复制引用链接
      </Menu.Item>
    </Menu>
  );
}
