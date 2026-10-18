import { useEffect, useState } from "react";
import { Link, Navigate, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { CloudOff, LogOut, Puzzle } from "lucide-react";
import { Button, Loading, toast } from "@tau/ui";
import type { Session, User } from "../../../contracts";
import { errorMessage } from "../api/errors";
import { ErrorState } from "../components/states";
import { queryKeys, useApi } from "./api";
import { rememberReturnTo, takeReturnTo, useSession } from "./session";

function Avatar({ user }: { user: User }) {
  const [broken, setBroken] = useState(false);
  if (!user.avatarUrl || broken) {
    return (
      <span className="bg-accent-soft text-accent-text text-tau-micro grid size-7 place-items-center rounded-full font-semibold">
        {user.login.slice(0, 1).toUpperCase()}
      </span>
    );
  }
  return (
    <img
      src={user.avatarUrl}
      alt=""
      className="size-7 rounded-full"
      onError={() => setBroken(true)}
    />
  );
}

function Header({ user }: { user: User }) {
  const api = useApi();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [leaving, setLeaving] = useState(false);
  const logout = async () => {
    setLeaving(true);
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
    } finally {
      setLeaving(false);
    }
  };
  return (
    <header className="border-line-1 bg-page/90 sticky top-0 z-20 border-b backdrop-blur">
      <div className="mx-auto flex h-14 max-w-[1120px] items-center gap-3 px-6">
        <Link to="/submissions" className="text-ink-1 flex items-center gap-2 font-semibold">
          <span className="bg-accent-soft text-accent-text rounded-tau-sm grid size-7 place-items-center">
            <Puzzle size={16} strokeWidth={1.8} />
          </span>
          Tau 插件发布
        </Link>
        <div className="ml-auto flex items-center gap-3">
          <Link to="/plugins" className="text-tau-sm text-accent-text">
            浏览插件
          </Link>
          <span className="text-tau-sm text-ink-2 flex items-center gap-2">
            <Avatar user={user} />
            {user.login}
          </span>
          <Button
            size="sm"
            variant="ghost"
            icon={LogOut}
            loading={leaving}
            onClick={() => void logout()}
          >
            退出
          </Button>
        </div>
      </div>
    </header>
  );
}

/** 需要登录的页面：未登录或会话过期回到登录页，登录后回到原页面 */
export function AuthenticatedShell() {
  const session = useSession();
  const location = useLocation();
  const navigate = useNavigate();
  const user = session.data?.user ?? null;

  // 回跳目标只存一次，取出即清除，重复执行无副作用
  const signedIn = !!user;
  useEffect(() => {
    if (!signedIn) return;
    const target = takeReturnTo();
    if (target && target !== location.pathname + location.search)
      navigate(target, { replace: true });
  }, [signedIn, location.pathname, location.search, navigate]);

  if (session.isPending) return <Loading />;
  if (session.isError && !session.data) {
    return (
      <main className="mx-auto max-w-[640px] px-6 py-16">
        <ErrorState
          icon={CloudOff}
          title="无法连接发布服务"
          error={session.error}
          onRetry={() => void session.refetch()}
          retrying={session.isRefetching}
        />
      </main>
    );
  }
  if (!user) {
    rememberReturnTo(location.pathname + location.search);
    return <Navigate to="/login" replace />;
  }
  return (
    <div className="min-h-screen">
      <Header user={user} />
      <main className="mx-auto max-w-[1120px] px-6 pb-16 pt-8">
        <Outlet />
      </main>
    </div>
  );
}
