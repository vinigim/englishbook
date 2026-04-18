import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        display: ["var(--font-display)", "serif"],
        body: ["var(--font-body)", "sans-serif"],
      },
      colors: {
        ink: "#1a1a1a",
        paper: "#faf7f2",
        accent: "#d4421a",
        muted: "#6b6560",
        line: "#e8e2d9",
      },
    },
  },
  plugins: [],
};
export default config;
