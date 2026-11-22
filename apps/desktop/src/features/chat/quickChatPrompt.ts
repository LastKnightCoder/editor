import type { PiPromptDisplay } from "@/types/pi-session";
import { onPiSessionEvent, piSessionPrompt } from "@/commands/piSession";

/** prompt IPC 在整轮结束才返回，首条用户消息进入会话后即可交接到侧栏。 */
export async function submitQuickChatPrompt(
  sessionId: string,
  text: string,
  display: PiPromptDisplay,
  onAccepted: () => void
) {
  let accepted = false;
  const accept = () => {
    if (accepted) return;
    accepted = true;
    onAccepted();
  };
  const unsubscribe = onPiSessionEvent(sessionId, event => {
    if (event.type === "message_start" && event.message.role === "user") accept();
  });
  try {
    const outcome = await piSessionPrompt(sessionId, text, [], display);
    if (!outcome.ok) throw new Error(outcome.error || "发送失败");
    accept();
  } finally {
    unsubscribe();
  }
}
