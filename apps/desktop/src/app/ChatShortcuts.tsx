import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { usePage } from "@/page/PageProvider";
import { openChatInDock } from "@/features/chat/openInDock";
import { useShellStore } from "./shellStore";
import { toggleAssistFor, useAssistOwnerStore } from "./assistOwner";

const QuickChatInput = lazy(() => import("@/features/chat/components/QuickChatInput"));

export function ChatShortcuts() {
  const { navigator } = usePage();
  const [request, setRequest] = useState<{
    entry: ReturnType<typeof navigator.current>;
    origin: HTMLElement | null;
  } | null>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const entry = navigator.current();
  const owner = useAssistOwnerStore(s => entry && s.owners[entry.key]);

  useEffect(() => {
    const onKeydown = (event: KeyboardEvent) => {
      if (
        event.isComposing ||
        event.altKey ||
        !(event.ctrlKey || event.metaKey) ||
        event.key.toLowerCase() !== "j"
      )
        return;
      event.preventDefault();
      const page = navigator.current();
      if (!event.shiftKey) {
        toggleAssistFor(page?.key, useShellStore.getState().toggleAssist);
        return;
      }
      if (
        event.repeat ||
        (event.target instanceof Element && event.target.closest('[aria-modal="true"]'))
      )
        return;
      if (input.current) {
        input.current.focus();
        return;
      }
      const origin = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      setRequest({ entry: page, origin });
    };
    window.addEventListener("keydown", onKeydown);
    return () => window.removeEventListener("keydown", onKeydown);
  }, [navigator]);

  if (!request || request.entry !== entry) return null;
  const target = owner?.quickChat() ?? {
    chatScope: "main-chat",
    placeholder:
      entry?.key === "chat" ? "开一个新对话，问点什么" : "问点什么，回答会在右栏的新对话里继续",
    show: (id: string) => {
      if (entry?.key === "chat") navigator.push("chat", { id });
      else openChatInDock(id);
    },
  };
  return (
    <Suspense fallback={null}>
      <QuickChatInput
        target={target}
        input={input}
        onClose={() => {
          setRequest(null);
          if (request.origin?.isConnected) request.origin.focus({ preventScroll: true });
        }}
      />
    </Suspense>
  );
}
