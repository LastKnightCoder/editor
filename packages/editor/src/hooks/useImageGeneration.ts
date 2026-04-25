import { useEditorServices } from "../contexts/EditorServicesContext";

export const useImageGeneration = () => {
  const services = useEditorServices();
  return services?.imageGeneration;
};
