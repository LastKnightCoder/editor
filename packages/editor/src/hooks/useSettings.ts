import { useEditorServices } from '../contexts/EditorServicesContext';

const useSettings = () => {
  const { settings } = useEditorServices();
  return settings;
};

export default useSettings;
