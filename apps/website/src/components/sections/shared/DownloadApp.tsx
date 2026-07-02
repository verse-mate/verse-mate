import Image from "next/image";
import Section from "@/components/ui/Section";
import Reveal from "@/components/ui/Reveal";

export default function DownloadApp() {
  return (
    <Section
      className="bg-brand-light-cream"
      containerClassName="flex flex-col gap-12"
    >
      <div className="flex flex-col items-center gap-12 lg:flex-row lg:items-center lg:justify-between lg:gap-16">
        {/* Text content */}
        <Reveal className="flex w-full max-w-[640px] flex-col items-start gap-8">
          <div className="flex flex-col items-start gap-4">
            <h1 className="m-0 font-merriweather text-display text-brand-black">
              Understand{" "}
              <span className="italic text-brand-tan-hover">
                God&rsquo;s Word
              </span>{" "}
              with VerseMate
            </h1>
            <p className="m-0 font-inter text-body-lg text-brand-slate">
              When people truly understand Scripture, lives change.
            </p>
            <p className="m-0 font-inter text-body-lg text-brand-slate">
              VerseMate helps anyone, anywhere explore God&rsquo;s Word with
              clarity and faithful insight. Choose your depth—Summary,
              Line-by-Line, or In-Depth Study. Available in multiple Bible
              versions and languages.
            </p>
          </div>

          <div className="flex w-full flex-col items-start gap-3">
            <h2 className="m-0 font-inter text-heading-3 text-brand-black">
              Download VerseMate Now
            </h2>
            <p className="m-0 font-inter text-body text-brand-slate">
              No paywalls. No clutter.
              <br />
              Just the truth of God&rsquo;s Word, made simple.
            </p>

            <div className="mt-2 flex flex-row items-center gap-4">
              <a
                href="https://apps.apple.com/us/app/verse-mate/id6756897180"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center rounded-lg bg-black no-underline transition-transform duration-200 hover:-translate-y-0.5"
              >
                <Image
                  src="/appStore.png"
                  alt="Download on the App Store"
                  width={197}
                  height={58}
                  className="h-[52px] w-auto rounded-lg"
                />
              </a>
              <a
                href="https://play.google.com/store/apps/details?id=org.versemate.app"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center rounded-lg bg-black no-underline transition-transform duration-200 hover:-translate-y-0.5"
              >
                <Image
                  src="/googleStore.png"
                  alt="Get it on Google Play"
                  width={197}
                  height={58}
                  className="h-[52px] w-auto rounded-lg"
                />
              </a>
            </div>
          </div>
        </Reveal>

        {/* Phone mockup */}
        <Reveal
          delayMs={120}
          className="w-full max-w-[420px] flex-shrink-0 lg:max-w-[460px]"
        >
          <Image
            src="/versemate-app-mockup.png"
            alt="VerseMate app interface on a phone"
            width={499}
            height={649}
            priority
            sizes="(max-width: 1024px) 80vw, 460px"
            className="h-auto w-full object-contain"
          />
        </Reveal>
      </div>

      {/* Tagline — centered at the bottom, matching the home hero */}
      <p className="m-0 text-center font-inter text-tagline text-brand-slate">
        Always free. For everyone. Forever.
      </p>
    </Section>
  );
}
