import { useMemo } from "react";
import { useColorScheme } from "react-native";

import colors from "@/constants/colors";

/**
 * Returns the design tokens for the current color scheme.
 *
 * Memoized by color scheme — returns the same object reference when
 * the scheme hasn't changed, preventing unnecessary re-renders in
 * all components that call this hook.
 */
export function useColors() {
  const scheme = useColorScheme();

  return useMemo(() => {
    const palette =
      scheme === "dark" && "dark" in colors
        ? (colors as unknown as Record<string, typeof colors.light>).dark
        : colors.light;
    return { ...palette, radius: colors.radius };
  }, [scheme]);
}
