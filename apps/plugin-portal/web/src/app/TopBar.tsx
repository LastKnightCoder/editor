import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { PLUGIN_DEVELOPER_DOCS_URL } from "@tau/plugins/center";
import {
  ArrowUpRight,
  ChevronDown,
  Github,
  LogIn,
  LogOut,
  PackagePlus,
  Puzzle,
} from "lucide-react";
import { Button, Menu, cn, toast } from "@tau/ui";
import type { Session, User } from "../../../contracts";
import { errorMessage } from "../api/errors";
import { useSubmissionCounts } from "../features/submissions/queries";
import { queryKeys, useApi } from "./api";
import { useSession } from "./session";

export function Avatar({
  user,
  size = 26,
}: {
  user: Pick<User, "login" | "avatarUrl">;
  size?: number;
}) {
  const [broken, setBroken] = useState(false);
  const style = { width: size, height: size };
  if (!user.avatarUrl || broken) {
    return (
      <span
        style={style}
        className="bg-accent-soft text-accent-text text-tau-micro grid shrink-0 place-items-center rounded-full font-semibold"
      >
        {user.login.slice(0, 1).toUpperCase()}
      </span>
    );
  }
  return (
    <img
      src={user.avatarUrl}
      alt=""
      style={style}
      className="shrink-0 rounded-full"
      onError={() => setBroken(true)}
    />
  );
}

const navClass = (isActive: boolean) =>
  cn(
    "text-tau-body rounded-tau-sm flex items-center gap-1.5 px-3 py-[5px] transition-colors",
    isActive ? "bg-hover text-ink-1 font-medium" : "text-ink-2 hover:bg-hover hover:text-ink-1"
  );

/** 作者看「需修改」数，审核者看待审数 */
function WorkBadge({ session }: { session: Session }) {
  const reviewer = session.reviewer;
  const counts = useSubmissionCounts(reviewer ? "review" : "mine");
  const value = counts.data?.[reviewer ? "pending_review" : "changes_requested"] ?? 0;
  if (!value) return null;
  return (
    <span
      aria-label={reviewer ? `${value} 条待审核` : `${value} 条需修改`}
      className="bg-accent text-ink-inverse grid h-[17px] min-w-[17px] place-items-center rounded-full px-[5px] text-[10.5px] font-semibold"
    >
      {value}
    </span>
  );
}

function UserMenu({ user }: { user: User }) {
  const api = useApi();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const logout = async () => {
    try {
      await api.logout();
      queryClient.clear();
      queryClient.setQueryData<Session>(queryKeys.session, {
        user: null,
        csrfToken: null,
        reviewer: false,
      });
      navigate("/login", { replace: true });
    } catch (error) {
      toast.error(`退出失败：${errorMessage(error)}`);
    }
  };
  return (
    <Menu
      align="end"
      trigger={
        <button
          type="button"
          aria-label="账号菜单"
          className="rounded-tau-sm hover:bg-hover flex items-center gap-2 px-1.5 py-1 transition-colors"
        >
          <Avatar user={user} />
          <span className="text-tau-meta text-ink-2">{user.login}</span>
          <ChevronDown size={14} className="text-ink-3" />
        </button>
      }
    >
      <Menu.Item
        icon={<Github />}
        onSelect={() => window.open(`https://github.com/${user.login}`, "_blank", "noopener")}
      >
        GitHub 主页
      </Menu.Item>
      <Menu.Separator />
      <Menu.Item icon={<LogOut />} onSelect={() => void logout()}>
        退出登录
      </Menu.Item>
    </Menu>
  );
}

/** 全站统一顶栏：公开页与登录后的工作台共用 */
export function TopBar() {
  const session = useSession();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const user = session.data?.user ?? null;
  return (
    <header className="border-line-1 bg-page/90 sticky top-0 z-20 border-b backdrop-blur">
      <div className="mx-auto flex h-14 max-w-[1280px] items-center gap-6 px-6">
        <Link
          to="/plugins"
          className="text-tau-title text-ink-1 flex items-center gap-2.5 font-semibold"
        >
          <span className="bg-accent text-ink-inverse rounded-tau-sm grid size-7 place-items-center">
            <Puzzle size={15} strokeWidth={1.9} />
          </span>
          Tau 插件
        </Link>
        <nav className="flex items-center gap-1">
          <Link to="/plugins" className={navClass(pathname.startsWith("/plugins"))}>
            插件中心
          </Link>
          <Link
            to="/submissions"
            className={navClass(/^\/(submissions|review|moderation)/.test(pathname))}
          >
            发布与审核
            {session.data?.user && <WorkBadge session={session.data} />}
          </Link>
          <a
            href={PLUGIN_DEVELOPER_DOCS_URL}
            target="_blank"
            rel="noopener"
            className={navClass(false)}
          >
            开发文档
            <ArrowUpRight size={13} className="text-ink-3" />
          </a>
        </nav>
        <div className="ml-auto flex items-center gap-2">
          {user ? (
            <>
              <Button
                size="sm"
                variant="ghost"
                icon={PackagePlus}
                onClick={() => navigate("/submissions/new")}
              >
                发布插件
              </Button>
              <UserMenu user={user} />
            </>
          ) : (
            !session.isPending && (
              <Button size="sm" icon={LogIn} onClick={() => navigate("/login")}>
                登录发布
              </Button>
            )
          )}
        </div>
      </div>
    </header>
  );
}
