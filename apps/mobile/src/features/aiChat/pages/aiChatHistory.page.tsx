import { lazy, Suspense } from "react";
import { definePage } from "../../../router";

const ChatHistoryPage = lazy(() =>
  import("../ChatHistoryPage").then(module => ({ default: module.ChatHistoryPage }))
);

function AiChatHistoryScreen() {
  return (
    <Suspense fallback={<div className="bg-page fixed inset-0" />}>
      <ChatHistoryPage />
    </Suspense>
  );
}

export default definePage({
  key: "aiChatHistory",
  match: "single",
  params: {},
  component: AiChatHistoryScreen,
});
