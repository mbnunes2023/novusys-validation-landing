import type { Config } from "tailwindcss";

export default {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: "#1976d2"
        }
      },
      borderRadius: {
        "2xl": "1rem",
      }
    },
  },
  plugins: [],
} satisfies Config;
