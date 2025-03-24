const DEBUG_PERFORMANCE = false;

interface PerformanceMeasure {
  id: string;
  startTime: number;
  end: () => void;
}

export function measurePerformance(id: string): PerformanceMeasure {
  const startTime = performance.now();

  return {
    id,
    startTime,
    end: () => {
      if (!DEBUG_PERFORMANCE) return;

      const endTime = performance.now();
      const duration = endTime - startTime;
      console.log(`[Performance] ${id}: ${duration.toFixed(2)}ms`);
    },
  };
}

export function usePerformanceMonitor(componentName: string) {
  if (!DEBUG_PERFORMANCE) return;

  const startTime = performance.now();

  return () => {
    const endTime = performance.now();
    const duration = endTime - startTime;
    console.log(`[Render] ${componentName}: ${duration.toFixed(2)}ms`);
  };
}

export function enablePerformanceMonitoring(enable: boolean) {
  (window as any).__CHAT_PERFORMANCE_MONITORING__ = enable;
}

export function isPerformanceMonitoringEnabled(): boolean {
  return !!(window as any).__CHAT_PERFORMANCE_MONITORING__ || DEBUG_PERFORMANCE;
}
