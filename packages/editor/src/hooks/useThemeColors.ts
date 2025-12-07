import { useMemo } from 'react';
import { useEditorServices } from '../contexts/EditorServicesContext';
import useTheme from './useTheme';

const useThemeColors = () => {
  const { theme: themeService } = useEditorServices();
  const { theme } = useTheme();

  const colors = useMemo(() => {
    return themeService.colors();
  }, [theme, themeService]);

  return colors;
};

export default useThemeColors;