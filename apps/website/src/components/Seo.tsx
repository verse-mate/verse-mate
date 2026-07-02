import Head from "next/head";
import { useRouter } from "next/router";

/** Production origin — used to build absolute canonical + OG/Twitter URLs. */
const SITE_URL = "https://versemate.org";

type SeoProps = {
  title: string;
  description?: string;
};

/**
 * Per-page document title + meta + social cards. Builds an absolute canonical
 * URL and Open Graph / Twitter tags so link shares render a proper preview.
 *
 * NOTE: og:image / twitter:image are intentionally omitted for now — the
 * share-preview card is deferred. Re-add og:image (+ width/height) and switch
 * twitter:card back to "summary_large_image" when the card is ready.
 */
export default function Seo({ title, description }: SeoProps) {
  const router = useRouter();
  const path = (router?.asPath || "/").split(/[?#]/)[0];
  const canonical = `${SITE_URL}${path === "/" ? "" : path}`;

  return (
    <Head>
      <title>{title}</title>
      {description ? <meta name="description" content={description} /> : null}
      <link rel="canonical" href={canonical} />

      {/* Open Graph */}
      <meta property="og:type" content="website" />
      <meta property="og:site_name" content="VerseMate" />
      <meta property="og:title" content={title} />
      {description ? (
        <meta property="og:description" content={description} />
      ) : null}
      <meta property="og:url" content={canonical} />

      {/* Twitter */}
      <meta name="twitter:card" content="summary" />
      <meta name="twitter:title" content={title} />
      {description ? (
        <meta name="twitter:description" content={description} />
      ) : null}
    </Head>
  );
}
