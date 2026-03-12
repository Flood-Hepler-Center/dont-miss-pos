import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        paper: {
          cream: "#FAFAF8",
          lines: "#E8DCC8",
          edge: "#D4C4B0",
        },
        ink: {
          black: "#2D2D2D",
          blue: "#4A90E2",
          red: "#E85D75",
        },
        food: "#8B6F47",
        beverage: "#6BB6D6",
        dessert: "#FFB6C1",
        special: "#FF9F5A",
        "success-green": "#7BC47F",
        "error-red": "#FF6B6B",
        "warning-yellow": "#FFD93D",
      },
      fontFamily: {
        sans: ["Patrick Hand", "cursive"],
        playful: ["Patrick Hand", "Caveat", "cursive"],
        body: ["Quicksand", "sans-serif"],
        price: ["Nunito", "sans-serif"],
        inter: ["Inter", "sans-serif"],
        "sour-gummy": ["var(--font-sour-gummy)", "cursive"],
      },
      boxShadow: {
        sketch: "4px 4px 0px rgba(45, 45, 45, 0.08)",
        "sketch-lg": "6px 6px 0px rgba(45, 45, 45, 0.08)",
        "soft-xs": "0 1px 2px rgba(0, 0, 0, 0.05)",
        "soft-sm": "0 1px 3px rgba(0, 0, 0, 0.05)",
        "soft-md": "0 4px 6px rgba(0, 0, 0, 0.05)",
        "soft-lg": "0 10px 15px rgba(0, 0, 0, 0.08)",
      },
    },
  },
  plugins: [],
};
export default config;
