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
