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
        // Identidade Lux Derma
        ink: "#1a2b24", // quase-preto esverdeado (texto)
        paper: "#f6f1e7", // creme quente (fundo)
        brand: "#1c3d31", // verde profundo Lux (superfícies)
        "brand-dark": "#142d24", // verde mais escuro (bordas/hover)
        accent: "#cf6f4f", // terracota/coral (destaque)
        gold: "#c6a24c", // dourado (detalhes)
        muted: "#6f6a60", // taupe/cinza quente
        line: "#e7dfd0", // filete quente
      },
    },
  },
  plugins: [],
};
export default config;
