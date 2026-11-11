import type { AppProps } from "next/app";
import Head from "next/head";
import { useRouter } from "next/router";
import { useEffect } from "react";
import { Inter, Merriweather } from "next/font/google";
import "@/styles/globals.css";
import "@/styles/coach.css";
import { capturePageview, startAnalytics } from "@/lib/analytics/posthog";
import { smartBannerContent } from "@/lib/store-links";
import { STRUCTURED_DATA } from "@/lib/structured-data";

if (typeof window !== "undefined") startAnalytics(window).catch(() => undefined);

// Self-hosted via next/font — no render-blocking Google Fonts request, no
// FOUT/layout shift. These set the same CSS vars the whole site already reads
// (--font-inter / --font-merriweather), so they are the single font source.
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
  fallback: ["system-ui", "sans-serif"],
});

const merriweather = Merriweather({
  subsets: ["latin"],
  weight: ["400", "700", "900"],
  variable: "--font-merriweather",
  display: "swap",
  fallback: ["Georgia", "serif"],
});

const OG_IMAGE = "https://versemate.org/og-card.png";

export default function App({ Component, pageProps }: AppProps) {
  const router = useRouter();
  useEffect(() => {
    router.events.on("routeChangeComplete", capturePageview);
    return () => router.events.off("routeChangeComplete", capturePageview);
  }, [router.events]);
  return (
    <div className={`${inter.variable} ${merriweather.variable}`}>
      <Head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <meta property="og:image" content={OG_IMAGE} key="og:image" />
        <meta property="og:image:width" content="1200" key="og:image:width" />
        <meta property="og:image:height" content="630" key="og:image:height" />
        <meta name="twitter:image" content={OG_IMAGE} key="twitter:image" />
        <meta name="apple-itunes-app" content={smartBannerContent()} />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(STRUCTURED_DATA) }}
        />
      </Head>
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>
      <Component {...pageProps} />
    </div>
  );
}
