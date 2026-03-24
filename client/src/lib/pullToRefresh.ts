import { useEffect, useRef } from "react";

const THRESHOLD = 64;
const MAX_PULL = 90;

/**
 * Pull-to-Refresh — React stateを使わずDOM直接操作でラグゼロ実現
 * iOS対応: touchmove は window レベルで passive:false
 */
export function usePullToRefresh(
  onRefresh: () => void | Promise<void>,
  scrollRef: React.RefObject<HTMLElement | null>,
  indicatorRef: React.RefObject<HTMLElement | null>
) {
  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;

  useEffect(() => {
    const el = scrollRef.current;
    const indicator = indicatorRef.current;
    if (!el || !indicator) return;

    let startY = 0;
    let pulling = false;
    let rafId = 0;

    const setIndicator = (height: number, state: "idle" | "pulling" | "ready" | "refreshing") => {
      indicator.style.height = height > 0 ? `${height}px` : "0px";
      indicator.dataset.ptr = state;
    };

    const onTouchStart = (e: TouchEvent) => {
      if (el.scrollTop > 2) return;
      if (!el.contains(e.target as Node)) return;
      startY = e.touches[0].clientY;
      pulling = true;
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!pulling) return;
      if (el.scrollTop > 2) {
        pulling = false;
        setIndicator(0, "idle");
        return;
      }
      const delta = e.touches[0].clientY - startY;
      if (delta <= 0) {
        setIndicator(0, "idle");
        return;
      }
      e.preventDefault();
      const pull = Math.min(MAX_PULL, delta * 0.4);
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        setIndicator(pull, pull >= THRESHOLD ? "ready" : "pulling");
      });
    };

    const onTouchEnd = async () => {
      if (!pulling) return;
      pulling = false;
      cancelAnimationFrame(rafId);

      const icon = indicator.querySelector<HTMLElement>(".ptr-icon");
      const currentH = parseFloat(indicator.style.height) || 0;

      if (currentH >= THRESHOLD) {
        setIndicator(52, "refreshing");
        try {
          await onRefreshRef.current();
        } finally {
          setIndicator(0, "idle");
        }
      } else {
        setIndicator(0, "idle");
      }
    };

    el.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: false });
    window.addEventListener("touchend", onTouchEnd);
    window.addEventListener("touchcancel", onTouchEnd);

    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
      window.removeEventListener("touchcancel", onTouchEnd);
      cancelAnimationFrame(rafId);
    };
  }, [scrollRef, indicatorRef]);
}
