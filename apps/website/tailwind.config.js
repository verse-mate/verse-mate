/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/sections/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/layouts/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        roboto: ["Roboto", "sans-serif"],
        "roboto-serif": ["Roboto Serif", "serif"],
        merriweather: ["var(--font-merriweather, Merriweather, serif)"],
        inter: ["var(--font-inter, Inter, system-ui, sans-serif)"],
      },
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        brand: {
          gold: "#936E2B",
          black: "#000000",
          white: "#FFFFFF",
          "dark-gray": "#1B1B1B",
          cream: "#F1EDE3",
          "light-cream": "#F6F3EC",
          tan: "#C2B291",
          slate: "#3E464D",
        },
      },
      backgroundImage: {
        "hero-gradient": "linear-gradient(111.34deg, #000000 0%, #936E2B 100%)",
        "dark-gradient": "linear-gradient(180deg, #1B1B1B 0%, #000000 100%)",
        "overlay-gradient":
          "linear-gradient(90deg, rgba(0, 0, 0, 0.7) 0%, rgba(0, 0, 0, 0.3) 100%)",
        "light-radial":
          "radial-gradient(50% 50% at 50% 50%, #FFFFFF 0%, #F1EDE3 100%)",
        "why-versemate-overlay":
          "linear-gradient(270deg, rgba(0, 0, 0, 0) 0%, rgba(0, 0, 0, 0.8) 100%)",
      },
      spacing: {
        18: "4.5rem",
        22: "5.5rem",
        26: "6.5rem",
        30: "7.5rem",
      },
      borderRadius: {
        "4xl": "2rem",
        "5xl": "2.5rem",
        full: "100px",
      },
    },
  },
  plugins: [],
};