/** 由宿主创建、符合浏览器 WebSocket 事件和方法契约的连接。 */
export type PluginSocket = WebSocket;
export interface PluginSocketOptions {
  headers?: Readonly<Record<string, string>>;
  signal?: AbortSignal;
}
export interface PluginWebSocket {
  connect(url: string, protocols?: string | string[], options?: PluginSocketOptions): PluginSocket;
}
