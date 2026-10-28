/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Premium Dark Reddish / Crimson brand palette
        brand: {
          50: "#fff1f3",
          100: "#ffe4e8",
          200: "#fecdd6",
          300: "#fda4b5",
          400: "#fb718d",
          500: "#e11d48", // radiant crimson
          600: "#be123c", // royal ruby
          700: "#9f1239", // deep crimson
          800: "#881337", // rich burgundy
          900: "#4c0519", // dark wine
          950: "#2a030d", // obsidian velvet
        },
        // Map indigo to luxurious crimson / wine tones for seamless cohesive aesthetic
        indigo: {
          50: "#fff1f3",
          100: "#ffe4e8",
          200: "#fecdd6",
          300: "#fda4b5",
          400: "#fb718d",
          500: "#e11d48",
          600: "#be123c",
          700: "#9f1239",
          800: "#881337",
          900: "#4c0519",
          950: "#2a030d",
        },
        // Wine & Burgundy dark surfaces
        wine: {
          50: "#fcf6f8",
          100: "#f8ecf1",
          200: "#f2dbe4",
          300: "#e7bece",
          400: "#d697b0",
          500: "#be7190",
          600: "#a35273",
          700: "#873e5a",
          800: "#70354b",
          900: "#5e2f41",
          950: "#180a10",
        },
        // Warm gold & amber accent for rich color mixture
        gold: {
          50: "#fffbeb",
          100: "#fef3c7",
          200: "#fde68a",
          300: "#fcd34d",
          400: "#fbbf24",
          500: "#f59e0b",
          600: "#d97706",
          700: "#b45309",
          800: "#92400e",
          900: "#78350f",
        },
      },
      boxShadow: {
        'ruby': '0 4px 20px -2px rgba(190, 18, 60, 0.25)',
        'ruby-lg': '0 10px 25px -3px rgba(190, 18, 60, 0.35)',
        'dark-card': '0 4px 25px 0 rgba(0, 0, 0, 0.45)',
      },
    },
  },
  plugins: [],
}
