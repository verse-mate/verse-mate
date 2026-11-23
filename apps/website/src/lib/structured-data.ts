const SITE_URL = "https://versemate.org";
const ORG_ID = `${SITE_URL}/#org`;

export const APP_STORE_URL =
  "https://apps.apple.com/us/app/verse-mate/id6756897180";
export const PLAY_STORE_URL =
  "https://play.google.com/store/apps/details?id=org.versemate.app";
export const APP_STORE_ID = "6756897180";
export const APP_STORE_PROVIDER_TOKEN = "128394884";

export const STRUCTURED_DATA = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "NGO",
      "@id": ORG_ID,
      name: "VerseMate",
      alternateName: ["Versemate", "Verse-Mate"],
      url: SITE_URL,
      logo: `${SITE_URL}/versemate-logo.png`,
      email: "info@versemate.org",
      description:
        "VerseMate is a 501(c)(3) nonprofit making the Bible easier to understand, for everyone, everywhere.",
      nonprofitStatus: "Nonprofit501c3",
      sameAs: [APP_STORE_URL, PLAY_STORE_URL, "https://github.com/verse-mate"],
    },
    {
      "@type": "WebSite",
      "@id": `${SITE_URL}/#website`,
      url: `${SITE_URL}/`,
      name: "VerseMate",
      alternateName: ["Versemate", "Verse-Mate"],
      publisher: { "@id": ORG_ID },
    },
    {
      "@type": "MobileApplication",
      name: "VerseMate",
      operatingSystem: "iOS, Android",
      applicationCategory: "ReferenceApplication",
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
      publisher: { "@id": ORG_ID },
      installUrl: [APP_STORE_URL, PLAY_STORE_URL],
      sameAs: [APP_STORE_URL, PLAY_STORE_URL],
    },
  ],
};
