"use client";

import React from "react";
import { WalletActivity } from "../types/wallet.types";

const useWalletActivity = () => {
  const [activities, setActivities] = React.useState<WalletActivity[]>([]);
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const fetchActivities = React.useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/activity/get");

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to fetch activities");
      }

      const data = await response.json();

      if (!data.activities || !Array.isArray(data.activities)) {
        console.error("Invalid activities data:", data);
        throw new Error("Invalid activities data received");
      }

      setActivities(data.activities);
    } catch (err: any) {
      setError(err.message);
      console.error("Error fetching activities:", err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    fetchActivities();
  }, [fetchActivities]);

  return {
    activities,
    isLoading,
    error,
    refetch: fetchActivities,
  };
};

export { useWalletActivity };
