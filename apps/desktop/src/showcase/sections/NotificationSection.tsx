/**
 * Notification 档案 —— notify 命令式 API + NotificationHost 真实现（Host 挂在
 * ShowcaseApp 根，触发即在窗口右上角生效）。常显标本用受 item 驱动的
 * NotificationCard 本体（固定 now，相对时间不漂）。
 */

import type { ReactNode } from "react";
import { Download } from "lucide-react";
import { notify, NotificationCard, type NotificationItem } from "@tau/ui";
import { ApiCard, BlockTitle, CanvasCard, DemoButton, DocHead, MatrixRow } from "../kit";

const MIN = 60_000;
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

function ControlRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center gap-4">
      <span className="text-tau-micro text-ink-2 w-10 shrink-0 text-right">{label}</span>
      <div className="flex flex-wrap items-center gap-2.5">{children}</div>
    </div>
  );
}

/* ---------- 真实触发的场景（与现有通知来源一一对应） ---------- */

const fireJoin = () =>
  notify({
    title: "林然申请加入协作",
    body: "「设计周刊 · 第 12 期」· 请求编辑权限",
    source: "协作",
    avatar: "林",
    avatarSeed: "user-linran",
    sticky: true,
    actions: [
      { label: "拒绝", resolvedText: "已拒绝林然的加入申请" },
      {
        label: "同意",
        primary: true,
        resolvedText: "已同意林然加入协作",
        onClick: () => wait(900),
      },
    ],
  });

const fireUpdate = () =>
  notify({
    id: "app-update",
    title: "发现新版本 v3.3.0",
    body: "Tau v3.3.0 已发布，建议更新到最新版本。",
    source: "应用更新",
    icon: Download,
    sticky: true,
    actions: [{ label: "稍后" }, { label: "前往更新", primary: true }],
  });

const firePublished = () =>
  notify({
    title: "站点已发布",
    body: "128 篇文章 · 用时 42 秒",
    source: "发布",
    tone: "ok",
    actions: [{ label: "查看站点" }],
  });

let retries = 0;
const firePublishFailed = () =>
  notify({
    title: "发布失败",
    body: "3 篇文章的图片上传超时，其余内容未改动。",
    source: "发布",
    tone: "danger",
    sticky: true,
    actions: [
      { label: "查看详情" },
      {
        label: "重试",
        primary: true,
        resolvedText: "已重新发布 · 128 篇文章",
        // 奇数次失败、偶数次成功：两条收尾路径都能点到
        onClick: async () => {
          await wait(1100);
          if (++retries % 2 === 1) throw new Error("重试失败：网络不可用，请检查连接后再试");
        },
      },
    ],
  });

/* ---------- 常显标本 ---------- */

const NOW = Date.UTC(2026, 8, 24, 10, 42);

function specimen(item: Partial<NotificationItem> & Pick<NotificationItem, "title">) {
  return { id: item.title, sticky: true, duration: 8000, timestamp: NOW, ...item };
}

const JOIN = specimen({
  title: "林然申请加入协作",
  body: "「设计周刊 · 第 12 期」· 请求编辑权限",
  source: "协作",
  avatar: "林",
  avatarSeed: "user-linran",
  timestamp: NOW - 2 * MIN,
  actions: [{ label: "拒绝" }, { label: "同意", primary: true }],
});
const UPDATE = specimen({
  title: "发现新版本 v3.3.0",
  body: "Tau v3.3.0 已发布，建议更新到最新版本。",
  source: "应用更新",
  icon: Download,
  timestamp: NOW - 40 * MIN,
  actions: [{ label: "稍后" }, { label: "前往更新", primary: true }],
});
const FAILED = specimen({
  title: "发布失败",
  body: "3 篇文章的图片上传超时，其余内容未改动。",
  source: "发布",
  tone: "danger",
  actions: [{ label: "查看详情" }, { label: "重试", primary: true }],
});

export default function NotificationSection() {
  return (
    <>
      <DocHead
        title="Notification"
        en="primitives/Notification.tsx"
        duty="右上角通知卡栈，承载不是当下操作引发的事件（协作者、应用更新、后台任务）。卡片 = 34px 身份位 + 文字列（标题与「来源 · 时间」同行，说明至多 2 行）+ 横跨整卡的等宽按钮条；需作答的常驻，纯告知 8 秒后自动关、悬停冻结；超过 3 张时露边叠放。"
        src="packages/ui/src/primitives/Notification.tsx"
      />

      <CanvasCard
        cap="LIVE"
        note="真实触发（窗口右上角生效；可点按钮作答）"
        stageClassName="flex min-h-[220px] flex-col items-start justify-center"
      >
        <div className="flex flex-col gap-5">
          <ControlRow label="场景">
            <DemoButton onClick={fireJoin}>加入申请</DemoButton>
            <DemoButton onClick={fireUpdate}>发现新版本（同 id 去重）</DemoButton>
            <DemoButton onClick={firePublished}>发布完成</DemoButton>
            <DemoButton onClick={firePublishFailed}>发布失败</DemoButton>
          </ControlRow>
          <ControlRow label="卡栈">
            <DemoButton
              primary
              onClick={() =>
                [firePublished, fireJoin, firePublishFailed, fireJoin, fireUpdate].forEach(
                  (fire, i) => setTimeout(fire, i * 380)
                )
              }
            >
              连发 5 条（验叠层）
            </DemoButton>
            <DemoButton onClick={() => notify.dismiss()}>全部清除</DemoButton>
          </ControlRow>
        </div>
      </CanvasCard>

      <BlockTitle en="NotificationCard 本体常显标本">状态矩阵</BlockTitle>
      <MatrixRow
        name="需作答"
        desc={
          <>
            <code>sticky</code> 常驻到有答案；主动作 <code>primary</code> 放最右，次要动作统一描边
          </>
        }
      >
        <NotificationCard item={UPDATE} now={NOW} />
      </MatrixRow>
      <MatrixRow
        name="来自他人"
        desc={
          <>
            <code>avatar</code> 头像取 tag 1–5 派生色，<code>avatarSeed</code> 保证同人同色
          </>
        }
      >
        <NotificationCard item={JOIN} now={NOW} />
      </MatrixRow>
      <MatrixRow
        name="语义态"
        desc={
          <>
            <code>tone</code> 只染身份位：ok 对勾 / danger 警示；卡片本体恒中性
          </>
        }
      >
        <NotificationCard
          item={specimen({
            title: "站点已发布",
            body: "128 篇文章 · 用时 42 秒",
            source: "发布",
            tone: "ok",
            sticky: false,
            actions: [{ label: "查看站点" }],
          })}
          now={NOW}
        />
        <NotificationCard item={FAILED} now={NOW} />
      </MatrixRow>
      <MatrixRow
        name="作答中 → 结果行"
        desc={
          <>
            <code>onClick</code> 返回 promise：该按钮 loading、整条锁定；兑现后收成{" "}
            <code>resolvedText</code> 一行，1.6 秒后退场
          </>
        }
      >
        <NotificationCard item={{ ...JOIN, busy: 1 }} now={NOW} />
        <NotificationCard item={{ ...JOIN, resolvedText: "已同意林然加入协作" }} now={NOW} />
      </MatrixRow>
      <MatrixRow
        name="作答失败"
        desc="promise 拒绝：说明位换成错误文案（danger 墨），按钮解锁可重试"
      >
        <NotificationCard
          item={{ ...FAILED, error: "重试失败：网络不可用，请检查连接后再试" }}
          now={NOW}
        />
      </MatrixRow>
      <MatrixRow name="长文本 · 无动作" desc="标题单行省略，说明至多 2 行；无动作时没有按钮条">
        <NotificationCard
          item={specimen({
            title: "发布失败：图片上传超时，部分文章未能同步到站点",
            body: "《Rust 所有权笔记》《置身事内读后》等 12 篇文章的图片上传超时（OSS 返回 504），其余内容未改动，可以稍后重试或查看完整日志。",
            source: "发布",
            tone: "danger",
            actions: [{ label: "查看详情" }, { label: "重试", primary: true }],
          })}
          now={NOW}
        />
        <NotificationCard
          item={specimen({
            title: "站点已发布",
            body: "128 篇文章 · 用时 42 秒",
            source: "发布",
            tone: "ok",
          })}
          now={NOW}
        />
      </MatrixRow>
      <MatrixRow name="悬停态" desc="关闭钮在悬停或键盘聚焦时出现在左上外沿（标本常显）">
        <NotificationCard item={FAILED} now={NOW} showClose />
      </MatrixRow>

      <ApiCard title="API 备忘（命令式）">
        <table>
          <thead>
            <tr>
              <th>API</th>
              <th>说明</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <code>notify(options) → id</code>
              </td>
              <td>
                <code>title / body / source / icon / avatar / tone / actions / sticky</code>
              </td>
            </tr>
            <tr>
              <td>
                <code>options.id</code>
              </td>
              <td>业务键；同 id 再次 notify 原位更新而非新增</td>
            </tr>
            <tr>
              <td>
                <code>actions[]</code>
              </td>
              <td>
                至多 2 个：<code>label / primary / onClick / resolvedText</code>；onClick 返回
                promise 时组件托管 loading、结果行与报错
              </td>
            </tr>
            <tr>
              <td>
                <code>sticky · duration</code>
              </td>
              <td>需作答的设 sticky 常驻；否则默认 8000ms 自动关，悬停冻结</td>
            </tr>
            <tr>
              <td>
                <code>notify.update(id, patch) · notify.dismiss(id?)</code>
              </td>
              <td>原位改内容；关闭一条或全部（带退场动画）</td>
            </tr>
            <tr>
              <td>
                <code>&lt;NotificationHost /&gt;</code>
              </td>
              <td>壳层挂载一次；层级 z-[190]，在 Toast（200）之下</td>
            </tr>
          </tbody>
        </table>
      </ApiCard>
    </>
  );
}
