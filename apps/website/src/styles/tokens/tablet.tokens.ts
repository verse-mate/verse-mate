/**
 * Tablet design tokens for adaptive design
 */

export const tabletTokens = {
  // Spacing tokens
  spacing: {
    xs: "6px",
    sm: "12px",
    md: "24px",
    lg: "32px",
    xl: "48px",
    xxl: "64px",
    container: "32px",
    section: "48px",
    element: "24px",
    micro: "12px",
  },

  // Typography tokens
  typography: {
    hero: {
      fontSize: "36px",
      lineHeight: "44px",
      fontWeight: 700,
      letterSpacing: "-0.02em",
      fontFamily: "Merriweather, serif",
    },
    h1: {
      fontSize: "32px",
      lineHeight: "40px",
      fontWeight: 700,
      letterSpacing: "-0.01em",
      fontFamily: "Merriweather, serif",
    },
    h2: {
      fontSize: "24px",
      lineHeight: "32px",
      fontWeight: 600,
      letterSpacing: "-0.01em",
      fontFamily: "Inter, sans-serif",
    },
    body: {
      fontSize: "18px",
      lineHeight: "28px",
      fontWeight: 400,
      letterSpacing: "0em",
      fontFamily: "Inter, sans-serif",
    },
    caption: {
      fontSize: "16px",
      lineHeight: "24px",
      fontWeight: 400,
      letterSpacing: "0em",
      fontFamily: "Inter, sans-serif",
    },
    button: {
      fontSize: "18px",
      fontWeight: 600,
      fontFamily: "Inter, sans-serif",
      lineHeight: "22px",
    },
  },

  // Component-specific tokens
  components: {
    button: {
      height: "48px",
      minWidth: "48px",
      padding: "16px 32px",
      borderRadius: "24px",
      fontSize: "18px",
      fontWeight: 600,
      lineHeight: "22px",
    },
    card: {
      padding: "24px",
      borderRadius: "16px",
      gap: "16px",
    },
    nav: {
      height: "72px",
      padding: "16px 32px",
    },
  },

  // Layout tokens
  layout: {
    maxWidth: "768px",
    containerPadding: "32px",
    headerHeight: "72px",
    footerHeight: "100px",
    sectionSpacing: "48px",
  },

  // Colors (same across devices)
  colors: {
    primary: "#C2B291",
    text: {
      primary: "#000000",
      secondary: "#3E464D",
      white: "#FFFFFF",
    },
    background: {
      white: "#FFFFFF",
      beige: "#F6F3EC",
      dark: "#1B1B1B",
    },
    gray: "#C4C4C4",
  },
};
