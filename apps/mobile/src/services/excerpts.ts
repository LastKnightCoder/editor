import type { MobileExcerpts } from "../app/plugins/excerpts";

let current: MobileExcerpts | null = null;

export function installMobileExcerptHost(host: MobileExcerpts) {
  current = host;
  return () => {
    if (current === host) current = null;
  };
}

/** 供宿主后续入口调用；异步解析固定当前工作区，切库后拒绝迟到跳转。 */
export async function openMobileExcerpt(id: number): Promise<void> {
  const host = current;
  if (!host) throw new Error("摘录宿主尚未就绪，请稍后重试");
  await host.open(id, () => {
    if (current !== host) throw new Error("摘录工作区已切换");
  });
}
