import Head from "next/head";
import { useRouter } from "next/router";

const SITE_URL = "https://versemate.org";

type SeoProps = {
  title: string;
  description?: string;
};

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
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={title} />
      {description ? (
        <meta name="twitter:description" content={description} />
      ) : null}
    </Head>
  );
}
