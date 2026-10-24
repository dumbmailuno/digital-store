import type { Config } from "tailwindcss";

// Restrained, neutral palette: no neon, no gradients.
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: { DEFAULT: "#16181d", soft: "#4b5160", mute: "#767d8c" },
        paper: { DEFAULT: "#ffffff", dim: "#f6f7f9", line: "#e3e6eb" },
        accent: { DEFAULT: "#2b4a7d", hover: "#223b64" },
        ok: "#1f7a4d",
        warn: "#9a6700",
        bad: "#b3261e",
      },
      fontFamily: {
        sans: ["ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      borderRadius: { DEFAULT: "6px" },
    },
  },
  plugins: [],
};
export default config;
