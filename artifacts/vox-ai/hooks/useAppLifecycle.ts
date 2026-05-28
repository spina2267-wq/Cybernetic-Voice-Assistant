import { useCallback, useEffect, useRef } from "react";
import { AppState, AppStateStatus } from "react-native";

interface AppLifecycleOptions {
  onForeground?: (backgroundDurationMs: number) => void;
  onBackground?: () => void;
}

/**
 * Tracks app foreground/background transitions with accurate timing.
 * Callbacks are stable — safe to use in dependency arrays.
 * 
 * onForeground receives how long the app was in background (ms).
 * Use this to detect stale states and recover sessions automatically.
 */
export function useAppLifecycle({
  onForeground,
  onBackground,
}: AppLifecycleOptions = {}) {
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const backgroundAtRef = useRef<number | null>(null);

  // Stable refs so we don't recreate the listener on every render
  const onForegroundRef = useRef(onForeground);
  const onBackgroundRef = useRef(onBackground);
  useEffect(() => { onForegroundRef.current = onForeground; }, [onForeground]);
  useEffect(() => { onBackgroundRef.current = onBackground; }, [onBackground]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (nextState: AppStateStatus) => {
      const prev = appStateRef.current;
      appStateRef.current = nextState;

      const goingToBackground =
        prev === "active" &&
        (nextState === "background" || nextState === "inactive");

      const comingToForeground =
        nextState === "active" &&
        (prev === "background" || prev === "inactive");

      if (goingToBackground) {
        backgroundAtRef.current = Date.now();
        onBackgroundRef.current?.();
      } else if (comingToForeground) {
        const duration = backgroundAtRef.current
          ? Date.now() - backgroundAtRef.current
          : 0;
        backgroundAtRef.current = null;
        onForegroundRef.current?.(duration);
      }
    });

    return () => sub.remove();
  }, []); // single stable listener, no deps needed
}

/**
 * Quick check: is the app currently in the foreground?
 */
export function isAppActive(): boolean {
  return AppState.currentState === "active";
}
