import { Navigate, createBrowserRouter, useRouteError } from "react-router-dom";
import { Bug } from "lucide-react";
import { Button } from "@tau/ui";
import { ErrorState } from "../components/states";
import { LoginPage } from "../pages/LoginPage";
import { NewSubmissionPage } from "../pages/NewSubmissionPage";
import { SubmissionDetailPage } from "../pages/SubmissionDetailPage";
import { SubmissionsPage } from "../pages/SubmissionsPage";
import { AuthenticatedShell, PublicShell } from "./AppShell";
import { CatalogPage } from "../pages/CatalogPage";
import { ModerationPage } from "../pages/ModerationPage";
import { PluginModerationPage } from "../pages/PluginModerationPage";
import { AppFeedbackPage } from "../pages/AppFeedbackPage";
import { PluginDetailPage } from "../pages/PluginDetailPage";
import { ReviewPage } from "../pages/ReviewPage";
import { ReviewQueuePage } from "../pages/ReviewQueuePage";

function RouteError() {
  const error = useRouteError();
  return (
    <main className="mx-auto max-w-[640px] px-6 py-16">
      <ErrorState
        icon={Bug}
        title="页面出错了"
        error={error}
        actions={<Button onClick={() => window.location.assign("/plugins")}>回到插件中心</Button>}
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
        {
          element: <PublicShell />,
          children: [
            { path: "/plugins", element: <CatalogPage /> },
            { path: "/plugins/:pluginId", element: <PluginDetailPage /> },
          ],
        },
        { path: "/login", element: <LoginPage /> },
        {
          element: <AuthenticatedShell />,
          children: [
            { path: "/submissions", element: <SubmissionsPage /> },
            { path: "/submissions/new", element: <NewSubmissionPage /> },
            { path: "/submissions/:id", element: <SubmissionDetailPage /> },
            { path: "/review", element: <ReviewQueuePage /> },
            { path: "/review/:id", element: <ReviewPage /> },
            { path: "/moderation", element: <ModerationPage /> },
            { path: "/moderation/plugins", element: <PluginModerationPage /> },
            { path: "/app-feedback", element: <AppFeedbackPage /> },
          ],
        },
        { path: "*", element: <Navigate to="/plugins" replace /> },
      ],
    },
  ]);
}
