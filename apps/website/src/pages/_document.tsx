import { Head, Html, Main, NextScript } from "next/document";

export default function Document() {
  return (
    <Html lang="en" className="no-js">
      <Head>
        {/* Swap no-js -> js before paint so scroll-reveal hidden states only
            apply when JS can reveal them (no blank flash for no-JS users). */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "document.documentElement.classList.remove('no-js');document.documentElement.classList.add('js');",
          }}
        />
        {/* Fonts are self-hosted via next/font in _app.tsx — no external
            Google Fonts request. */}
        <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png" />
        <link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png" />
        <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
        <meta name="theme-color" content="#1B1B1B" />
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
