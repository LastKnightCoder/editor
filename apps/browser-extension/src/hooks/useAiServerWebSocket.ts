import { useState, useEffect, useRef, useCallback } from "react";
import WebSocketClient from "../utils/WebSocketClient";
import type { ConnectionStatus } from "../utils/types";

const AI_SERVER_URL = "ws://localhost:24678/aiServer";
const RECONNECT_INTERVAL = 3000;
const MAX_RECONNECT_INTERVAL = 30000;

interface UseAiServerWebSocketReturn {
  status: ConnectionStatus;
  client: WebSocketClient | null;
  reconnect: () => void;
}

/**
 * aiServer WebSocket 连接管理 Hook
 * 连接到 /aiServer 路径，用于获取 LLM 配置、Prompt、Embedding 等设置信息
 * 自动连接、断线重连、指数退避
 */
export function useAiServerWebSocket(): UseAiServerWebSocketReturn {
  const [status, setStatus] = useState<ConnectionStatus>("connecting");
  const clientRef = useRef<WebSocketClient | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectIntervalRef = useRef(RECONNECT_INTERVAL);
  const mountedRef = useRef(true);

  const clearReconnectTimer = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
  }, []);

  const scheduleReconnect = useCallback(() => {
    clearReconnectTimer();
    reconnectTimerRef.current = setTimeout(() => {
      if (mountedRef.current) {
        connect();
      }
    }, reconnectIntervalRef.current);
    // 指数退避，上限 30s
    reconnectIntervalRef.current = Math.min(
      reconnectIntervalRef.current * 1.5,
      MAX_RECONNECT_INTERVAL,
    );
  }, [clearReconnectTimer]);

  const connect = useCallback(() => {
    // 断开旧连接
    if (clientRef.current) {
      clientRef.current.onOpenHandler = null;
      clientRef.current.onCloseHandler = null;
      clientRef.current.disconnect();
    }

    setStatus("connecting");
    const client = new WebSocketClient(AI_SERVER_URL);

    client.onOpenHandler = () => {
      if (mountedRef.current) {
        setStatus("connected");
        reconnectIntervalRef.current = RECONNECT_INTERVAL;
      }
    };

    client.onCloseHandler = () => {
      if (mountedRef.current) {
        setStatus("disconnected");
        scheduleReconnect();
      }
    };

    clientRef.current = client;
    client.connect();
  }, [scheduleReconnect]);

  const reconnect = useCallback(() => {
    clearReconnectTimer();
    reconnectIntervalRef.current = RECONNECT_INTERVAL;
    connect();
  }, [connect, clearReconnectTimer]);

  useEffect(() => {
    mountedRef.current = true;
    connect();

    return () => {
      mountedRef.current = false;
      clearReconnectTimer();
      if (clientRef.current) {
        clientRef.current.onOpenHandler = null;
        clientRef.current.onCloseHandler = null;
        clientRef.current.disconnect();
        clientRef.current = null;
      }
    };
  }, [connect, clearReconnectTimer]);

  return {
    status,
    client: clientRef.current,
    reconnect,
  };
}
