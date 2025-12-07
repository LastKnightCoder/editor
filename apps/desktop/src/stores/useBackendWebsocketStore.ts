import { create } from "zustand";
import WebSocketClient from "@/utils/WebSocketClient";

interface IState {
  client: WebSocketClient | null;
  isServerReady: boolean;
}

interface IActions {
  initClient: () => void;
  sendMessage: (method: string, params: unknown) => Promise<unknown>;
}

export const useBackendWebsocketStore = create<IState & IActions>(
  (set, get) => ({
    client: null,
    isServerReady: false,
    initClient: () => {
      const client = new WebSocketClient(
        "ws://localhost:24678/backendServer?isServer=false",
      );
      client.registerNotificationHandler("server-ready", () => {
        set({ isServerReady: true });
      });
      client.registerNotificationHandler("server-gone", () => {
        set({ isServerReady: false });
      });
      set({
        client,
      });
    },
    sendMessage: (method: string, params: unknown) => {
      const client = get().client;
      if (!client) {
        throw new Error("Client not initialized");
      }
      return client.sendRequest(method, params);
    },
  }),
);
