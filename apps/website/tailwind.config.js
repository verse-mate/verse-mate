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
        merriweather: ["var(--font-merriweather, Merriweather, serif)"],
        inter: ["var(--font-inter, Inter, system-ui, sans-serif)"],
      },
      // Fluid type scale — sizes interpolate smoothly with the viewport via
      // clamp(), replacing the per-breakpoint text-[..] md:.. lg:.. chains.
      // Semantic names, added via extend, so default sizes stay untouched.
      fontSize: {
        eyebrow: [
          "0.8125rem",
          { lineHeight: "1.4", letterSpacing: "0.18em", fontWeight: "700" },
        ],
        display: [
          "clamp(2.5rem, 6vw, 4.5rem)",
          { lineHeight: "1.08", fontWeight: "700", letterSpacing: "-0.01em" },
        ],
        "section-title": [
          "clamp(1.75rem, 1.25rem + 2.1vw, 3rem)",
          { lineHeight: "1.16", fontWeight: "700" },
        ],
        "heading-3": [
          "clamp(1.125rem, 1rem + 0.55vw, 1.5rem)",
          { lineHeight: "1.35", fontWeight: "700" },
        ],
        // Card heading/body — shared spec with the coach page's who-cards.
        "card-title": ["1.375rem", { lineHeight: "1.3", fontWeight: "700" }],
        "card-body": ["0.9375rem", { lineHeight: "1.65" }],
        "body-lg": [
          "clamp(1.0625rem, 0.98rem + 0.45vw, 1.375rem)",
          { lineHeight: "1.6" },
        ],
        body: ["clamp(1rem, 0.96rem + 0.25vw, 1.125rem)", { lineHeight: "1.6" }],
        tagline: [
          "clamp(1rem, 0.9rem + 0.4vw, 1.25rem)",
          { lineHeight: "1.5", letterSpacing: "0.18em" },
        ],
      },
      boxShadow: {
        card: "0 18px 40px -18px rgba(0, 0, 0, 0.35)",
        header: "0 2px 16px rgba(0, 0, 0, 0.08)",
      },
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        // Single source of truth lives in globals.css :root as RGB channels.
        // rgb(var(--x) / <alpha-value>) keeps /opacity modifiers working.
        brand: {
          gold: "rgb(var(--brand-gold) / <alpha-value>)",
          "gold-hover": "rgb(var(--brand-gold-hover) / <alpha-value>)",
          black: "rgb(var(--brand-black) / <alpha-value>)",
          white: "rgb(var(--brand-white) / <alpha-value>)",
          "dark-gray": "rgb(var(--brand-dark-gray) / <alpha-value>)",
          cream: "rgb(var(--brand-cream) / <alpha-value>)",
          "light-cream": "rgb(var(--brand-light-cream) / <alpha-value>)",
          tan: "rgb(var(--brand-tan) / <alpha-value>)",
          "tan-hover": "rgb(var(--brand-tan-hover) / <alpha-value>)",
          slate: "rgb(var(--brand-slate) / <alpha-value>)",
          // Shared neutral UI tokens (forms, cards, dividers, errors)
          muted: "rgb(var(--brand-muted) / <alpha-value>)",
          line: "rgb(var(--brand-line) / <alpha-value>)",
          surface: "rgb(var(--brand-surface) / <alpha-value>)",
          danger: "rgb(var(--brand-danger) / <alpha-value>)",
        },
      },
      backgroundImage: {
        // Gradients reference the brand tokens (single source of truth).
        "hero-gradient":
          "linear-gradient(111.34deg, rgb(var(--brand-black)) 0%, rgb(var(--brand-gold)) 100%)",
        "dark-gradient":
          "linear-gradient(180deg, rgb(var(--brand-dark-gray)) 0%, rgb(var(--brand-black)) 100%)",
        "light-radial":
          "radial-gradient(50% 50% at 50% 50%, rgb(var(--brand-white)) 0%, rgb(var(--brand-cream)) 100%)",
      },
      borderRadius: {
        // Semantic radius scale — one source for component rounding.
        input: "10px",
        card: "16px",
        full: "100px",
      },
    },
  },
  plugins: [],
};