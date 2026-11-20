"use client";

import { useEffect, useState } from "react";

/** Renders a time in the viewer's own time zone. Server HTML shows nothing to avoid a mismatch. */
export default function LocalTime({ iso, withDate = true }: { iso: string; withDate?: boolean }) {
  const [text, setText] = useState("");
  useEffect(() => {
    const d = new Date(iso);
    setText(
      d.toLocaleString(undefined, {
        ...(withDate ? { weekday: "short", month: "short", day: "numeric" } : {}),
        hour: "numeric",
        minute: "2-digit",
      }),
    );
  }, [iso, withDate]);
  return <time dateTime={iso} suppressHydrationWarning>{text}</time>;
}
