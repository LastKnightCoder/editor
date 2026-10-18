import { useEffect } from "react";
import { Navigate, Outlet, useLocation, useNavigate } from "react-router-dom";
import { CloudOff } from "lucide-react";
import { Loading } from "@tau/ui";
import { ErrorState } from "../components/states";
import { rememberReturnTo, takeReturnTo, useSession } from "./session";
import { TopBar } from "./TopBar";
import { WorkspaceSidebar } from "./WorkspaceSidebar";

/** 公开页面：插件中心与插件详情，无需登录 */
export function PublicShell() {
  return (
    <div className="min-h-screen">
      <TopBar />
      <Outlet />
    </div>
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
      <TopBar />
      <div className="mx-auto flex max-w-[1280px]">
        <WorkspaceSidebar reviewer={!!session.data?.reviewer} />
        <main className="min-w-0 flex-1 px-8 pb-16 pt-7">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
