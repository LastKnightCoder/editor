import { invoke } from "@/electron";

/** 编译 Tailwind 源码，返回编译产物 CSS（失败返回空串由调用方降级） */
export async function compileTailwind(payload: {
  content: string;
  extension: string;
}): Promise<string> {
  return invoke("custom-block:compile-tailwind", payload);
}
