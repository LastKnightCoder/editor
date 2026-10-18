import { Navigate, createBrowserRouter, useRouteError } from "react-router-dom";
import { Bug } from "lucide-react";
import { Button } from "@tau/ui";
import { ErrorState } from "../components/states";
import { LoginPage } from "../pages/LoginPage";
import { NewSubmissionPage } from "../pages/NewSubmissionPage";
import { SubmissionDetailPage } from "../pages/SubmissionDetailPage";
import { SubmissionsPage } from "../pages/SubmissionsPage";
import { AuthenticatedShell } from "./AppShell";
import { CatalogPage } from "../pages/CatalogPage";
import { ModerationPage } from "../pages/ModerationPage";

function RouteError() {
  const error = useRouteError();
  return (
    <main className="mx-auto max-w-[640px] px-6 py-16">
      <ErrorState
        icon={Bug}
        title="页面出错了"
        error={error}
        actions={
          <Button onClick={() => window.location.assign("/submissions")}>回到我的提交</Button>
        }
      />
    </main>
  );
}

export function createPortalRouter() {
  return createBrowserRouter([
    {
      errorElement: <RouteError />,
      children: [
        { path: "/", element: <Navigate to="/plugins" replace /> },
        { path: "/plugins", element: <CatalogPage /> },
        { path: "/login", element: <LoginPage /> },
        {
          element: <AuthenticatedShell />,
          children: [
            { path: "/submissions", element: <SubmissionsPage /> },
            { path: "/moderation", element: <ModerationPage /> },
            { path: "/submissions/new", element: <NewSubmissionPage /> },
            { path: "/submissions/:id", element: <SubmissionDetailPage /> },
          ],
        },
        { path: "*", element: <Navigate to="/submissions" replace /> },
      ],
    },
  ]);
}
