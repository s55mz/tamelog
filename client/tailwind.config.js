/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // ── Background layers (light mode)
        bg: {
          DEFAULT: "#F2F2F7",
          1:       "#FFFFFF",
          2:       "#F2F2F7",
          3:       "#E5E5EA",
        },
        // ── Borders
        line: {
          DEFAULT: "#E5E5EA",
          hi:      "#D1D1D6",
        },
        // ── Text
        ink: {
          DEFAULT: "#1C1C1E",
          2:       "#636366",
          3:       "#AEAEB2",
        },
        // ── Brand / semantic (iOS palette)
        brand:    "#007AFF",
        jade:     "#34C759",
        coral:    "#FF3B30",
        amber:    "#FF9500",
        sky:      "#5AC8FA",
        // ── Soft tints
        "brand-soft": "#E8F3FF",
        "jade-soft":  "#EDFAF1",
        "coral-soft": "#FFF0EF",
        "amber-soft": "#FFF5E6",
        "sky-soft":   "#EAF8FF",
        // ── Legacy aliases
        income:   "#34C759",
        expense:  "#FF3B30",
        saving:   "#FF9500",
        transfer: "#5AC8FA",
        surface: {
          0: "#FFFFFF",
          1: "#F2F2F7",
          2: "#E5E5EA",
          3: "#D1D1D6",
        },
        fence: {
          DEFAULT: "#E5E5EA",
          hi:      "#D1D1D6",
        },
      },
      fontFamily: {
        sans:  ['"Noto Sans JP"', '-apple-system', 'BlinkMacSystemFont', '"Hiragino Sans"', 'sans-serif'],
        serif: ['"Noto Serif JP"', 'Georgia', 'serif'],
        mono:  ['"IBM Plex Mono"', 'ui-monospace', '"SF Mono"', 'Menlo', 'monospace'],
      },
      borderRadius: {
        xl:    "12px",
        "2xl": "16px",
        "3xl": "20px",
        "4xl": "24px",
      },
      boxShadow: {
        card:    "0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)",
        "card-md":"0 4px 20px rgba(0,0,0,0.10)",
        float:   "0 8px 32px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.06)",
      },
      animation: {
        "fade-up":  "fadeUp 0.25s ease both",
        "slide-up": "slideUp 0.28s cubic-bezier(0.32,0.72,0,1) both",
        "fade-in":  "fadeIn 0.15s ease both",
      },
      keyframes: {
        fadeUp:  { from: { opacity: 0, transform: "translateY(10px)" }, to: { opacity: 1, transform: "none" } },
        slideUp: { from: { opacity: 0, transform: "translateY(100%)" }, to: { opacity: 1, transform: "none" } },
        fadeIn:  { from: { opacity: 0 }, to: { opacity: 1 } },
      },
    },
  },
  plugins: [],
}
