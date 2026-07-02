import type { AppProps } from "next/app";
import Head from "next/head";
import { Inter, Merriweather } from "next/font/google";
import "@/styles/globals.css";
import "@/styles/coach.css";

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

// Organization / nonprofit structured data — same on every page, lets search
// engines render the knowledge panel and rich results.
const ORG_JSON_LD = {
  "@context": "https://schema.org",
  "@type": "NGO",
  name: "VerseMate",
  url: "https://versemate.org",
  logo: "https://versemate.org/versemate-logo.png",
  description:
    "VerseMate is a 501(c)(3) nonprofit making the Bible easier to understand—for everyone, everywhere.",
};

export default function App({ Component, pageProps }: AppProps) {
  return (
    <div className={`${inter.variable} ${merriweather.variable}`}>
      <Head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(ORG_JSON_LD) }}
        />
      </Head>
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>
      <Component {...pageProps} />
    </div>
  );
}
