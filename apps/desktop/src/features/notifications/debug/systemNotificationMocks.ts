/**
 * 系统通知窗口的调试 mock：全部经 appNotify 的 force: "system" 直发系统窗口，
 * 让应用聚焦时也能测试窗口外的通知样式与作答交互（开发悬浮球「系统通知窗口」组调用）。
 */

import { appNotify } from "../notify";

/** mock id 统一前缀，便于与业务通知区分 */
function debugId(seq: number): string {
  return `debug-${Date.now()}-${seq}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/** 1. 纯告知：正文两行左右长度，测试系统窗口里的截断 */
export function sendPlainNotification(): string {
  appNotify(
    {
      id: debugId(0),
      icon: "bell",
      title: "这是一条纯告知通知",
      body: "用于观察系统通知窗口里的正文换行与截断表现，这一段写长一些是为了让内容超过一行的宽度。",
      source: "调试工具",
    },
    { force: "system" }
  );
  return "已发送纯告知";
}

/** 2. 成功回执 */
export function sendOkNotification(): string {
  appNotify(
    {
      id: debugId(0),
      tone: "ok",
      title: "发布完成",
      body: "站点已更新到最新版本",
      source: "调试工具",
    },
    { force: "system" }
  );
  return "已发送成功通知";
}

/** 3. 失败 + 重试：主按钮 1.2s 后 resolve */
export function sendDangerNotification(): string {
  appNotify(
    {
      id: debugId(0),
      tone: "danger",
      title: "发布失败",
      body: "网络连接超时，请检查后重试",
      source: "调试工具",
      actions: [
        {
          label: "重试",
          primary: true,
          onClick: () => sleep(1200),
          resolvedText: "已重新发布",
        },
      ],
    },
    { force: "system" }
  );
  return "已发送失败通知（点「重试」看作答中）";
}

/** 4. 人物作答：拒绝会报错、同意会成功，验证 sticky 常驻与两侧按钮 */
export function sendAvatarNotification(): string {
  appNotify(
    {
      id: debugId(0),
      avatar: "林",
      avatarSeed: "mock-device-1",
      title: "林同学 请求加入协作",
      source: "协作",
      sticky: true,
      actions: [
        {
          label: "拒绝",
          onClick: () => sleep(1000).then(() => Promise.reject(new Error("模拟失败：网络异常"))),
        },
        {
          label: "同意",
          primary: true,
          onClick: () => sleep(1000),
          resolvedText: "已同意加入",
        },
      ],
    },
    { force: "system" }
  );
  return "已发送人物作答通知（拒绝会展示失败）";
}

/** 5. 连发 5 条：间隔 150ms，测试展开 3 张 + 叠层 + 还有 N 条 */
export function sendBurstNotifications(): string {
  const titles = ["同步完成", "卡片已保存", "导出就绪", "收藏已更新", "定时任务已触发"];
  titles.forEach((title, index) => {
    setTimeout(() => {
      appNotify(
        {
          id: debugId(index),
          icon: "bell",
          title,
          body: `连发测试第 ${index + 1} 条`,
          source: "调试工具",
        },
        { force: "system" }
      );
    }, index * 150);
  });
  return "已开始连发 5 条";
}

/** 6. 原位更新：固定 id 走 30% → 80% → 完成（带按钮）的进度三部曲 */
export function runProgressUpdateSequence(): string {
  appNotify(
    {
      id: "debug-progress",
      icon: "download",
      title: "正在下载更新",
      body: "已完成 30%",
      source: "调试工具",
    },
    { force: "system" }
  );
  setTimeout(() => {
    appNotify.update("debug-progress", { body: "已完成 80%" });
  }, 1500);
  setTimeout(() => {
    appNotify.update("debug-progress", {
      icon: "rotateCw",
      tone: "ok",
      title: "更新已下载",
      body: "重启即可安装",
      actions: [
        { label: "稍后", onClick: () => sleep(0) },
        { label: "立即重启", primary: true, onClick: () => sleep(0) },
      ],
    });
  }, 3000);
  return "进度模拟已开始（约 3 秒演完）";
}

/** 7. 延迟 3 秒按真实焦点分流：不传 force，验证失焦判断 */
export function scheduleRealRouteTest(): string {
  setTimeout(() => {
    appNotify({
      id: debugId(0),
      icon: "bell",
      title: "真实分流测试",
      body: "这条通知按发送时刻的窗口焦点决定去向",
      source: "调试工具",
    });
  }, 3000);
  return "已排定 3 秒后发送：3 秒内切到其他应用可看到系统窗口";
}

/** 8. 全部清除（应用内 + 系统窗口两侧） */
export function dismissAllNotifications(): string {
  appNotify.dismiss();
  return "已清除全部通知";
}
