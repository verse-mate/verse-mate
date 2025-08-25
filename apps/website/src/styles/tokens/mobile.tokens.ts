/**
 * Mobile design tokens for adaptive design
 */

export const mobileTokens = {
  // Spacing tokens
  spacing: {
    xs: "4px",
    sm: "8px",
    md: "16px",
    lg: "24px",
    xl: "32px",
    xxl: "48px",
    container: "16px",
    section: "32px",
    element: "16px",
    micro: "8px",
  },

  // Typography tokens
  typography: {
    hero: {
      fontSize: "28px",
      lineHeight: "36px",
      fontWeight: 700,
      letterSpacing: "-0.02em",
      fontFamily: "Merriweather, serif",
    },
    h1: {
      fontSize: "24px",
      lineHeight: "32px",
      fontWeight: 700,
      letterSpacing: "-0.01em",
      fontFamily: "Merriweather, serif",
    },
    h2: {
      fontSize: "20px",
      lineHeight: "28px",
      fontWeight: 600,
      letterSpacing: "-0.01em",
      fontFamily: "Inter, sans-serif",
    },
    h3: {
      fontSize: "18px",
      lineHeight: "26px",
      fontWeight: 600,
      letterSpacing: "-0.01em",
      fontFamily: "Inter, sans-serif",
    },
    body: {
      fontSize: "16px",
      lineHeight: "24px",
      fontWeight: 400,
      letterSpacing: "0em",
      fontFamily: "Inter, sans-serif",
    },
    caption: {
      fontSize: "14px",
      lineHeight: "20px",
      fontWeight: 400,
      letterSpacing: "0em",
      fontFamily: "Inter, sans-serif",
    },
    button: {
      fontSize: "16px",
      fontWeight: 600,
      fontFamily: "Inter, sans-serif",
    },
  },

  // Component-specific tokens
  components: {
    button: {
      height: "44px",
      minWidth: "44px",
      padding: "12px 20px",
      borderRadius: "22px",
      fontSize: "16px",
      fontWeight: 600,
      lineHeight: "20px",
    },
    card: {
      padding: "16px",
      borderRadius: "12px",
      gap: "12px",
    },
    nav: {
      height: "60px",
      padding: "12px 16px",
    },
  },

  // Layout tokens
  layout: {
    maxWidth: "100%",
    containerPadding: "16px",
    headerHeight: "60px",
    footerHeight: "80px",
    sectionSpacing: "32px",
  },

  // Effects tokens
  effects: {
    shadow: {
      card: "0px 2px 8px rgba(0, 0, 0, 0.1)",
      button: "0px 2px 4px rgba(0, 0, 0, 0.1)",
      nav: "0px 1px 3px rgba(0, 0, 0, 0.1)",
    },
  },

  // Colors (same across devices, but included for completeness)
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
