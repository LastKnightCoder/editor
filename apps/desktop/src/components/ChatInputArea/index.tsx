import { forwardRef, useState } from "react";
import {
  ChatInputArea as SharedChatInputArea,
  type ChatInputAreaHandle,
  type ChatInputAreaServices,
} from "@tau/shared";
import type { MenuProps } from "antd";
import useUploadResource from "@/hooks/useUploadResource";
import {
  convertFileSrc,
  createOrUpdateResource,
  getHomeDir,
  decrementResourceRefCount,
  incrementResourceRefCount,
} from "@/commands";
import type { IResourceSource } from "@/types";
import { ReasoningEffort } from "@/types/llm";
import MCPManagerModal from "@/components/MCPManagerModal";

export type { ChatInputAreaHandle };

interface ChatInputAreaProps {
  className?: string;
  contentEditable?: boolean;
  onPressEnter?: () => void;
  onStop?: () => void;
  placeholder?: string;
  sendLoading?: boolean;
  createMessageLoading?: boolean;
  onCreateNewMessage?: () => void;
  modelSelectItems?: MenuProps["items"];
  onModelSelect?: ({ key }: { key: string }) => void;
  currentModelName?: string;
  isSupportImage?: boolean;
  isSupportFile?: boolean;
  promptSelectItems?: MenuProps["items"];
  onPromptSelect?: ({ key }: { key: string }) => void;
  currentPromptName?: string;
  promptSelectDisabled?: boolean;
  resourceSource?: IResourceSource | null;
  reasoningEffort?: ReasoningEffort;
  onReasoningEffortChange?: (level: ReasoningEffort) => void;
  reasoningEffortDisabled?: boolean;
}

/**
 * 桌面端 ChatInputArea 包装组件
 * 注入桌面端特有的服务实现
 */
const ChatInputArea = forwardRef<ChatInputAreaHandle, ChatInputAreaProps>(
  (props, ref) => {
    const uploadResourceFn = useUploadResource();
    const [mcpManagerOpen, setMcpManagerOpen] = useState(false);

    // 创建桌面端服务实现
    const services: ChatInputAreaServices = {
      uploadFile: uploadResourceFn,
      convertFileSrc,
      getHomeDir,
      createOrUpdateResource: async (params) => {
        const result = await createOrUpdateResource({
          name: params.name,
          path: params.path,
          type: params.type as
            | "image"
            | "video"
            | "audio"
            | "pdf"
            | "epub"
            | "attachment",
          source: params.source as IResourceSource | undefined,
        });
        return result;
      },
      incrementResourceRef: async (path, source) => {
        await incrementResourceRefCount(
          path,
          source as IResourceSource | undefined,
        );
      },
      decrementResourceRef: async (path) => {
        await decrementResourceRefCount(path);
      },
    };

    return (
      <>
        <SharedChatInputArea
          ref={ref}
          services={services}
          onMcpManagerClick={() => setMcpManagerOpen(true)}
          {...props}
        />
        <MCPManagerModal
          open={mcpManagerOpen}
          onClose={() => setMcpManagerOpen(false)}
        />
      </>
    );
  },
);

ChatInputArea.displayName = "ChatInputArea";

export default ChatInputArea;
