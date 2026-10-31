import { beforeEach, describe, expect, it } from "vitest";
import { toast as uiToast } from "@tau/ui";
import { TOAST_DEFAULT_DURATION, toast, toastQueue } from "../toast";

describe("移动端 toast 适配 @tau/ui", () => {
  beforeEach(() => {
    toastQueue.clearAll();
  });

  it("success/info/error/warning 均进入统一队列", () => {
    toast.success("ok");
    toast.info("info");
    toast.warning("warn");
    toast.error("failed");
    expect(toastQueue.list().map(item => item.type)).toEqual([
      "success",
      "info",
      "warning",
      "error",
    ]);
  });

  it("插件与公共包调用的 @tau/ui toast 进入同一队列", () => {
    toast.info("应用");
    uiToast.success("插件");
    expect(toastQueue.list().map(item => item.text)).toEqual(["应用", "插件"]);
  });

  it("同 id 只保留一条，原位替换内容", () => {
    toast.info({ id: "hint", text: "按住说话" });
    toast.info({ id: "hint", text: "松手发送" });
    expect(toastQueue.list()).toMatchObject([{ key: "hint", text: "松手发送" }]);
  });

  it("返回的移除函数可手动删除 toast", () => {
    const dispose = toast.success("待移除");
    expect(toastQueue.list()).toHaveLength(1);
    dispose();
    expect(toastQueue.list()).toHaveLength(0);
  });

  it("支持默认与显式持续时间", () => {
    toast.info("默认时长");
    expect(toastQueue.list()[0]?.duration).toBe(TOAST_DEFAULT_DURATION);
    toastQueue.clearAll();
    toast.warning("自定义时长", 1200);
    expect(toastQueue.list()[0]?.duration).toBe(1200);
    toastQueue.clearAll();
    toast({ type: "success", text: "manual", duration: 4500 });
    expect(toastQueue.list()[0]?.duration).toBe(4500);
  });

  it("action 随消息入队并在缺省时为 undefined", () => {
    const onClick = () => {};
    toast({ type: "success", text: "已删除日记", action: { label: "撤销", onClick } });
    expect(toastQueue.list()[0]?.action).toEqual({ label: "撤销", onClick });
    toastQueue.clearAll();
    toast.success("普通消息");
    expect(toastQueue.list()[0]?.action).toBeUndefined();
  });
});
