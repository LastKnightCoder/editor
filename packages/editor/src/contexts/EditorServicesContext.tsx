import { createContext, useContext, ReactNode } from 'react';
import type { EditorServices } from '../types/services';

export const EditorServicesContext = createContext<EditorServices | null>(null);
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
