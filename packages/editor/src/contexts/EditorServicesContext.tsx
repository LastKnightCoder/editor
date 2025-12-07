import { createContext, useContext, ReactNode } from 'react';
import type { EditorServices } from '../types/services';

/**
 * Context for providing EditorServices to the Editor component tree.
 * This allows the Editor to access external services without direct imports.
 */
export const EditorServicesContext = createContext<EditorServices | null>(null);

/**
 * Hook to access EditorServices within the Editor component tree.
 * Throws an error if used outside of EditorServicesProvider.
 */
export function useEditorServices(): EditorServices {
  const services = useContext(EditorServicesContext);

  if (!services) {
    throw new Error(
      'useEditorServices must be used within EditorServicesProvider. ' +
      'Make sure your Editor component is wrapped with EditorServicesProvider.'
    );
  }

  return services;
}

/**
 * Provider component that supplies EditorServices to the Editor.
 */
export interface EditorServicesProviderProps {
  services: EditorServices;
  children: ReactNode;
}

export function EditorServicesProvider({ services, children }: EditorServicesProviderProps) {
  return (
    <EditorServicesContext.Provider value={services}>
      {children}
    </EditorServicesContext.Provider>
  );
}
