import { useEffect, useState } from "react";
import { onFirstTouch, readFirstTouch } from "@/lib/analytics/first-touch";

export function useFirstTouchChannel(): string {
  const [channel, setChannel] = useState("none");
  useEffect(() => {
    try {
      const stored = readFirstTouch(window.localStorage);
      if (stored) setChannel(stored.channel);
    } catch {
      return undefined;
    }
    return onFirstTouch((touch) => setChannel(touch.channel));
  }, []);
  return channel;
}
