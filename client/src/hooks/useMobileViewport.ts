import { useEffect, useState } from "react";

function updateViewportHeightVar() {
  const height = Math.round(window.visualViewport?.height ?? window.innerHeight);
  document.documentElement.style.setProperty("--app-viewport-height", `${height}px`);
}

export function useMobileViewport() {
  const [keyboardOpen, setKeyboardOpen] = useState(false);

  useEffect(() => {
    const handleViewport = () => {
      updateViewportHeightVar();
      const viewport = window.visualViewport;
      const visibleHeight = viewport?.height ?? window.innerHeight;
      const keyboardHeight = Math.max(0, window.innerHeight - visibleHeight - (viewport?.offsetTop ?? 0));
      setKeyboardOpen(keyboardHeight > 120);
    };

    handleViewport();
    window.addEventListener("resize", handleViewport);
    window.visualViewport?.addEventListener("resize", handleViewport);
    window.visualViewport?.addEventListener("scroll", handleViewport);

    return () => {
      window.removeEventListener("resize", handleViewport);
      window.visualViewport?.removeEventListener("resize", handleViewport);
      window.visualViewport?.removeEventListener("scroll", handleViewport);
    };
  }, []);

  const handleFocusIntoView = (event: React.FocusEvent<HTMLElement>) => {
    const target = event.target;

    if (!(target instanceof HTMLElement)) {
      return;
    }

    if (!target.matches("input, select, textarea")) {
      return;
    }

    window.setTimeout(() => {
      target.scrollIntoView({ block: "center", inline: "nearest" });
    }, 120);
  };

  return {
    keyboardOpen,
    handleFocusIntoView
  };
}
