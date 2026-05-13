import { useCallback, useState } from "react";

/**
 * Returns [capsOn, handlers] where handlers should be spread onto a password input
 * to detect Caps Lock state via keyboard events.
 */
export function useCapsLock() {
  const [capsOn, setCapsOn] = useState(false);

  const onKey = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (typeof e.getModifierState === "function") {
      setCapsOn(e.getModifierState("CapsLock"));
    }
  }, []);

  return {
    capsOn,
    handlers: { onKeyDown: onKey, onKeyUp: onKey, onBlur: () => setCapsOn(false) },
  } as const;
}
