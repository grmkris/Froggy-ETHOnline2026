import { useEffect, useState } from "react";

/** The clock as state, so "2 min ago" and "21 h left" stay honest without re-rendering every second. */
export const useNow = (everyMs = 60_000): number => {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => {
      setNow(Date.now());
    }, everyMs);
    return () => {
      clearInterval(timer);
    };
  }, [everyMs]);
  return now;
};
