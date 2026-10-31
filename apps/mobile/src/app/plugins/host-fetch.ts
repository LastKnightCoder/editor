/** 插件网络连接期间的宿主跨域 fetch；编辑器经 IFetchService 使用，未连接时请求失败。 */
let current: typeof fetch | undefined;

export function setMobileHostFetch(next: typeof fetch | undefined): void {
  current = next;
}

export const mobileHostFetch: typeof fetch = (input, init) =>
  current ? current(input, init) : Promise.reject(new TypeError("网络尚未就绪"));
