import { navigateToApp } from "@/lib/navigation";
import Image from "next/image";
import Button from "@/components/ui/Button";
import Container from "@/components/ui/Container";

export default function Hero() {
  return (
    <section className="relative w-full overflow-hidden bg-hero-gradient">
      {/* Decorative scripture-text texture — subtle, consistent opacity */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-cover bg-center bg-no-repeat opacity-40 md:hidden"
        style={{ backgroundImage: "url('/tilted-text-mobile.png')" }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 hidden bg-cover bg-center bg-no-repeat opacity-40 md:block"
        style={{
          backgroundImage: "url('/tilted-text-desktop.png')",
        }}
      />

      <Container className="relative z-10">
        <div className="flex flex-col gap-12 py-20 md:py-24 lg:min-h-[1000px] lg:justify-center lg:py-28 2xl:min-h-[900px]">
          {/* Text column — rendered instantly (above the fold, LCP) */}
          <div className="flex max-w-[620px] flex-col items-start gap-6 lg:max-w-[52%]">
            <h1 className="m-0 font-merriweather text-display text-white">
              The Bible Was Meant to Be{" "}
              <span className="italic text-brand-tan">Understood</span> - Not
              Just Read.
            </h1>

            <p className="m-0 max-w-[580px] font-inter text-body-lg text-white/90">
              When people truly understand Scripture, lives change. Versemate
              helps anyone, anywhere, connect with God&rsquo;s Word clearly - and
              grow deeper in faith.
            </p>

            <div className="flex w-full flex-col gap-4 pt-2 sm:w-auto sm:flex-row sm:items-center">
              {/* Primary — launch the web app */}
              <Button
                href="/"
                variant="light"
                onClick={(e) => {
                  e.preventDefault();
                  navigateToApp();
                }}
              >
                Try Versemate
              </Button>

              {/* Secondary — download the native app */}
              <Button href="/download-app" variant="outline">
                Get the app
              </Button>
            </div>
          </div>

          {/* Device mockup (mobile/tablet) — stacked under the text, contained. */}
          <div className="relative mx-auto w-full max-w-[560px] lg:hidden">
            <Image
              src="/hero-devices.png"
              alt="VerseMate showing Genesis 1 across desktop, tablet, and phone — with Summary, Line-by-Line, and Detailed views"
              width={1600}
              height={1156}
              priority
              sizes="92vw"
              className="h-auto w-full"
            />
          </div>
        </div>
      </Container>

      {/* Device mockup (lg+) — anchored to the section's right edge, enlarged,
          bleeding off the right (clipped by the section's overflow-hidden) to
          match the original hero framing. */}
      <div className="pointer-events-none absolute right-0 top-1/2 z-[6] hidden w-[52%] -translate-y-1/2 translate-x-[6%] lg:block xl:w-[49%] xl:translate-x-[4%] 2xl:w-[46%]">
        <Image
          src="/hero-devices.png"
          alt=""
          aria-hidden
          width={1600}
          height={1156}
          priority
          sizes="52vw"
          className="h-auto w-full"
        />
      </div>

      {/* Always-free tagline — one line, centered at the bottom of the hero */}
      <p className="pointer-events-none absolute inset-x-0 bottom-6 z-[7] m-0 whitespace-nowrap text-center font-inter text-tagline text-white/80 md:bottom-8">
        Always free. For everyone. Forever.
      </p>
    </section>
  );
}
