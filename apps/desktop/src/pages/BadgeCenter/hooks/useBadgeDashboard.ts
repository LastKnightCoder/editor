import { useCallback, useEffect, useRef, useState } from "react";
import type { BadgeDashboard } from "@/types";
import { evaluateAllBadges, getBadgeDashboard } from "@/commands/badge";

export interface UseBadgeDashboardResult {
  dashboard: BadgeDashboard | null;
  loading: boolean;
  refreshing: boolean;
  refresh: () => Promise<void>;
  reevaluate: () => Promise<void>;
}

export const useBadgeDashboard = (): UseBadgeDashboardResult => {
  const [dashboard, setDashboard] = useState<BadgeDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const mountedRef = useRef(true);

  const fetchDashboard = useCallback(async () => {
    const data = await getBadgeDashboard();
    if (mountedRef.current) {
      setDashboard(data);
    }
    return data;
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setLoading(true);
      try {
        await evaluateAllBadges();
        const data = await getBadgeDashboard();
        if (!cancelled) {
          setDashboard(data);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, []);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await fetchDashboard();
    } finally {
      if (mountedRef.current) {
        setRefreshing(false);
      }
    }
  }, [fetchDashboard]);

  const reevaluate = useCallback(async () => {
    setRefreshing(true);
    try {
      await evaluateAllBadges();
      await fetchDashboard();
    } finally {
      if (mountedRef.current) {
        setRefreshing(false);
      }
    }
  }, [fetchDashboard]);

  return {
    dashboard,
    loading,
    refreshing,
    refresh,
    reevaluate,
  };
};
