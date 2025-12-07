import { createContext, useContext, ReactNode } from 'react';

// Platform-specific handlers interface
export interface PlatformHandlers {
  // Image handlers
  loadImage?: (url: string) => Promise<string>; // Returns processed URL or blob URL

  // Video handlers
  loadVideo?: (url: string) => Promise<string>; // Returns processed URL or blob URL

  // Audio handlers
  loadAudio?: (url: string) => Promise<string>; // Returns processed URL or blob URL

  // File handlers
  selectFile?: (options?: { filters?: Array<{ name: string; extensions: string[] }>; multiple?: boolean }) => Promise<string[] | null>;
  readFile?: (path: string) => Promise<string>;

  // Add more platform-specific handlers as needed
}

const PlatformHandlersContext = createContext<PlatformHandlers>({});

export function PlatformHandlersProvider({
  children,
  handlers,
}: {
  children: ReactNode;
  handlers: PlatformHandlers;
}) {
  return (
    <PlatformHandlersContext.Provider value={handlers}>
      {children}
    </PlatformHandlersContext.Provider>
  );
}

export function usePlatformHandlers() {
  return useContext(PlatformHandlersContext);
}
