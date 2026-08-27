"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const BOTTOM_THRESHOLD_PX = 96;

export function useChatScroll(sessionId: string | undefined, messageKey: string) {
  const containerRef = useRef<HTMLDivElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef(true);
  const [showJumpToLatest, setShowJumpToLatest] = useState(false);

  const scrollToLatest = useCallback((behavior: ScrollBehavior = "smooth") => {
    stickToBottomRef.current = true;
    setShowJumpToLatest(false);
    endRef.current?.scrollIntoView({ behavior, block: "end" });
  }, []);

  const handleScroll = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;

    const distanceFromBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight;
    const isNearBottom = distanceFromBottom <= BOTTOM_THRESHOLD_PX;
    stickToBottomRef.current = isNearBottom;
    setShowJumpToLatest(!isNearBottom);
  }, []);

  useEffect(() => {
    stickToBottomRef.current = true;
    const frame = requestAnimationFrame(() => scrollToLatest("auto"));
    return () => cancelAnimationFrame(frame);
  }, [scrollToLatest, sessionId]);

  useEffect(() => {
    if (!stickToBottomRef.current) {
      setShowJumpToLatest(true);
      return;
    }
    const frame = requestAnimationFrame(() => scrollToLatest("auto"));
    return () => cancelAnimationFrame(frame);
  }, [messageKey, scrollToLatest]);

  return {
    containerRef,
    endRef,
    showJumpToLatest,
    handleScroll,
    scrollToLatest,
  };
}
