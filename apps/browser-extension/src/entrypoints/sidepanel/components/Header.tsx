import { useState } from "react";
import { App } from "antd";
import type WebSocketClient from "../../../utils/WebSocketClient";

interface HeaderProps {
  onSettingsClick: () => void;
  onReloadClick: () => void;
  wsClient: WebSocketClient | null;
}

export default function Header({
  onSettingsClick,
  onReloadClick,
  wsClient,
}: HeaderProps) {
  const { message } = App.useApp();
  const [saving, setSaving] = useState(false);

  const handleReadLater = async () => {
    if (saving) return;
    if (!wsClient?.isConnected) {
      message.warning("桌面端未连接，无法加入稍后读");
      return;
    }
    setSaving(true);
    try {
      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });
      if (!tab?.url) {
        message.warning("当前页面无法加入稍后读");
        return;
      }
      const result = (await wsClient.sendRequest(
        "read-later:add-from-extension",
        {
          title: tab.title || tab.url,
          url: tab.url,
        },
      )) as { duplicate?: boolean } | null;
      if (result?.duplicate) {
        message.info("已在稍后读中");
        return;
      }
      message.success("已加入稍后读");
    } catch (e) {
      console.error("[Tau] Failed to save to read later:", e);
      message.error("保存稍后读失败");
    } finally {
      setSaving(false);
    }
  };

  return (
    <header className="flex h-12 flex-shrink-0 items-center justify-between px-4">
      <div className="flex items-center gap-2">
        <img src="/icon/32.png" alt="Tau Logo" className="h-6 w-6 rounded-md" />
      </div>
      <div className="flex items-center gap-1">
        <HeaderButton
          onClick={handleReadLater}
          title="稍后读"
          disabled={!wsClient?.isConnected || saving}
        >
          <svg
            viewBox="0 0 24 24"
            className="h-4 w-4"
            fill="none"
            strokeWidth={1.5}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0 1 11.186 0Z"
            />
          </svg>
        </HeaderButton>
        <HeaderButton onClick={onSettingsClick} title="设置">
          <svg
            viewBox="0 0 24 24"
            className="h-4 w-4"
            fill="none"
            strokeWidth={1.5}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z"
            />
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"
            />
          </svg>
        </HeaderButton>

        <HeaderButton onClick={onReloadClick} title="重新连接">
          <svg
            className="h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.992 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182"
            />
          </svg>
        </HeaderButton>
      </div>
    </header>
  );
}

function HeaderButton({
  onClick,
  title,
  children,
  disabled,
}: {
  onClick: () => void;
  title: string;
  children: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="rounded-md p-1.5 text-gray-500 transition-colors hover:bg-black/5 hover:text-gray-900 disabled:opacity-40 disabled:cursor-not-allowed dark:text-gray-400 dark:hover:bg-white/10 dark:hover:text-[#e6edf3]"
      title={title}
    >
      {children}
    </button>
  );
}
