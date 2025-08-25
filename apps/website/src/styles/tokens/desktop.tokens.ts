/**
 * Desktop design tokens for adaptive design (current implementation)
 */

export const desktopTokens = {
  // Spacing tokens
  spacing: {
    xs: "8px",
    sm: "16px",
    md: "32px",
    lg: "48px",
    xl: "64px",
    xxl: "96px",
    container: "64px",
    section: "96px",
    element: "32px",
    micro: "16px",
  },

  // Typography tokens
  typography: {
    hero: {
      fontSize: "48px",
      lineHeight: "64px",
      fontWeight: 700,
      letterSpacing: "-0.02em",
      fontFamily: "Merriweather, serif",
    },
    h1: {
      fontSize: "48px",
      lineHeight: "64px",
      fontWeight: 700,
      letterSpacing: "-0.01em",
      fontFamily: "Merriweather, serif",
    },
    h2: {
      fontSize: "32px",
      lineHeight: "40px",
      fontWeight: 600,
      letterSpacing: "-0.01em",
      fontFamily: "Inter, sans-serif",
    },
    body: {
      fontSize: "24px",
      lineHeight: "32px",
      fontWeight: 400,
      letterSpacing: "0em",
      fontFamily: "Inter, sans-serif",
    },
    caption: {
      fontSize: "20px",
      lineHeight: "28px",
      fontWeight: 400,
      letterSpacing: "0em",
      fontFamily: "Inter, sans-serif",
    },
  },

  // Component-specific tokens
  components: {
    button: {
      height: "80px",
      minWidth: "204px",
      padding: "24px 48px",
      borderRadius: "100px",
      fontSize: "20px",
      fontWeight: 600,
      lineHeight: "32px",
      fontFamily: "Inter, sans-serif",
    },
    card: {
      padding: "32px",
      borderRadius: "20px",
      gap: "24px",
    },
    nav: {
      height: "76px",
      padding: "0px 64px",
    },
  },

  // Layout tokens
  layout: {
    maxWidth: "1440px",
    containerPadding: "64px",
    headerHeight: "76px",
    footerHeight: "180px",
    sectionSpacing: "96px",
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
