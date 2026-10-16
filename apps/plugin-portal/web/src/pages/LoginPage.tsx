import { Navigate, useSearchParams } from "react-router-dom";
import { Github, Puzzle } from "lucide-react";
import { Button, Loading, Panel } from "@tau/ui";
import { useApi } from "../app/api";
import { sessionExpiry, useSession, useSessionExpired } from "../app/session";
import { Notice } from "../components/Notice";

const STEPS = ["上传插件 ZIP 与图片", "填写介绍与源码信息", "提交，进入待审核"];

export function LoginPage() {
  const api = useApi();
  const session = useSession();
  const expired = useSessionExpired();
  const [params] = useSearchParams();
  const oauthFailed = params.get("error") === "oauth_failed";

  if (session.isPending) return <Loading />;
  if (session.data?.user) return <Navigate to="/submissions" replace />;

  const signIn = () => {
    sessionExpiry.clear();
    // 顶层导航：由发布服务完成 GitHub 授权并写入会话 Cookie
    window.location.assign(api.githubLoginUrl);
  };

  return (
    <main className="grid min-h-screen place-items-center px-6 py-12">
      <Panel className="flex w-full max-w-[420px] flex-col gap-5 px-8 py-9">
        <span className="bg-accent-soft text-accent-text rounded-tau-md grid size-11 place-items-center">
          <Puzzle size={22} strokeWidth={1.7} />
        </span>
        <div className="flex flex-col gap-1.5">
          <h1 className="text-tau-title-lg text-ink-1 font-semibold">发布 Tau 插件</h1>
          <p className="text-tau-sm text-ink-2 leading-[1.7]">
            使用 GitHub 账号登录，提交插件包与介绍，等待审核。
          </p>
        </div>

        {oauthFailed && (
          <Notice tone="danger" title="GitHub 授权没有完成">
            请重新登录；如果一直失败，请稍后再试。
          </Notice>
        )}
        {expired && !oauthFailed && (
          <Notice tone="warn" title="登录已过期">
            未保存的修改暂存在此浏览器，重新登录后回到草稿即可恢复。
          </Notice>
        )}
        {session.isError && (
          <Notice tone="warn" title="暂时无法连接发布服务">
            {session.error.message}
          </Notice>
        )}

        <Button variant="primary" block icon={Github} onClick={signIn}>
          使用 GitHub 登录
        </Button>

        <ol className="border-line-1 flex flex-col gap-2 border-t pt-5">
          {STEPS.map((step, index) => (
            <li key={step} className="text-tau-sm text-ink-2 flex items-center gap-2.5">
              <span className="bg-hover text-ink-2 text-tau-micro grid size-5 place-items-center rounded-full">
                {index + 1}
              </span>
              {step}
            </li>
          ))}
        </ol>
      </Panel>
    </main>
  );
}
