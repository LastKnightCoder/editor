import { useDrag } from "react-dnd";
import type { MentionRef } from "@tau/shared";

import { CHAT_CONTENT_DND_TYPE } from "@/utils/chat-content-dnd";

const useChatContentDrag = (reference: MentionRef) => {
  const [{ isDragging }, drag] = useDrag<
    MentionRef,
    void,
    { isDragging: boolean }
  >(
    () => ({
      type: CHAT_CONTENT_DND_TYPE,
      item: reference,
      collect: (monitor) => ({
        isDragging: monitor.isDragging(),
      }),
    }),
    [reference],
  );

  return { drag, isDragging };
};

export default useChatContentDrag;
