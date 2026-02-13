import type { ReactNode } from "react";
import type { ScreenPageKey, StackEntry } from "./types";

type ScreenStackHostProps = {
  screenStack: StackEntry<ScreenPageKey>[];
  activeScreenId: string | null;
  renderScreen: (entry: StackEntry<ScreenPageKey>) => ReactNode;
};

export function ScreenStackHost({
  screenStack,
  activeScreenId,
  renderScreen,
}: ScreenStackHostProps) {
  const cachedScreens = screenStack.filter(
    (entry) => entry.key !== "main.home",
  );

  return (
    <>
      {cachedScreens.map((entry) => {
        const isActive = activeScreenId !== null && entry.id === activeScreenId;
        return (
          <div
            key={entry.id}
            data-screen-entry-id={entry.id}
            data-screen-key={entry.key}
            data-screen-active={isActive ? "true" : "false"}
            aria-hidden={!isActive}
            style={isActive ? undefined : { display: "none" }}
          >
            {renderScreen(entry)}
          </div>
        );
      })}
    </>
  );
}

export default ScreenStackHost;
