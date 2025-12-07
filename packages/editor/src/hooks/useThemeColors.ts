import { useState } from 'react';
import { useMutationObserver } from 'ahooks';
import { useEditorServices } from '../contexts/EditorServicesContext';

const useThemeColors = () => {
  const { theme: themeService } = useEditorServices();

  const [colors, setColors] = useState(() => themeService.colors());

  // 监听 DOM 属性变化（data-theme, data-accent, class 等）
  useMutationObserver(
    () => {
      setColors(themeService.colors());
    },
    document.documentElement,
    {
      attributes: true,
    },
  );

  return colors;
};

export default useThemeColors;