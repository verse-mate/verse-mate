import React, { useState } from "react";
import { ShieldCheck, Lock } from "lucide-react";
import Seo from "@/components/Seo";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import PageHero from "@/components/ui/PageHero";
import Section from "@/components/ui/Section";
import Reveal from "@/components/ui/Reveal";
import Eyebrow from "@/components/ui/Eyebrow";

type Cadence = "monthly" | "once";

const PRESETS = [10, 25, 50, 100, 250, 500] as const;

export default function Give() {
  const [cadence, setCadence] = useState<Cadence>("monthly");
  const [amount, setAmount] = useState<number>(25);
  const [customInput, setCustomInput] = useState<string>("");

  const effectiveAmount = customInput
    ? Math.max(1, Number.parseInt(customInput.replace(/\D/g, ""), 10) || 0)
    : amount;

  const handleDonate = (e: React.FormEvent) => {
    e.preventDefault();
    const cadenceLabel = cadence === "monthly" ? "Monthly" : "One-time";
    const subject = `${cadenceLabel} donation — $${effectiveAmount}`;
    const body = `Hi VerseMate Team,

I'd like to give $${effectiveAmount} ${cadence === "monthly" ? "monthly" : "as a one-time gift"} to support VerseMate.

Please send me the next steps to complete this donation.

Thank you,`;
    const mailtoUrl = `mailto:info@versemate.org?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.location.href = mailtoUrl;
  };

  return (
    <div className="flex min-h-screen flex-col">
      <Seo
        title="Give — VerseMate"
        description="Support VerseMate. Your gift keeps Scripture free, clear, and accessible for everyone, everywhere. Donations are tax-deductible in the U.S."
      />
      <Header />

      <main id="main-content" className="flex-1">
      {/* Hero Section */}
      <PageHero
        eyebrow="Support VerseMate"
        title="Help People Everywhere Engage with God's Word"
        image="/give.png"
      >
        <p className="m-0">
          Your generosity helps us create resources and tools that make
          Scripture clear and accessible to people worldwide. Every gift you
          give makes a direct impact—whether it's supporting the translation of
          content, improving our technology, or helping us reach new communities
          with the truth of God's Word.
        </p>
        <p className="m-0">
          Through your partnership, VerseMate can continue developing simple,
          powerful tools that guide people not only to read the Bible, but to
          truly understand and apply it in their daily lives. We believe that
          when people engage Scripture with clarity, transformation
          follows—families are encouraged, faith grows stronger, and entire
          communities can be renewed.
        </p>
        <p className="m-0">
          Thank you for prayerfully considering a gift to VerseMate. Together,
          we can equip more people across languages and cultures to connect with
          God's Word in a deeper way.
        </p>
      </PageHero>

      {/* Donation Menu — mirrors the app's Giving screen.
          Uses the shared Section for vertical rhythm; bare keeps the
          dark full-bleed bg + the constrained 560px form. */}
      <Section
        bare
        className="bg-brand-dark-gray px-6 md:px-12 lg:px-16 xl:px-[120px]"
      >
        <Reveal className="mx-auto flex max-w-[560px] flex-col items-center gap-8">
          {/* Eyebrow */}
          <Eyebrow variant="light">Give Today</Eyebrow>

          {/* Headline */}
          <h2 className="m-0 text-center font-merriweather text-section-title text-white">
            Give the Word to{" "}
            <span className="italic text-brand-tan">the world.</span>
          </h2>

          {/* Lead */}
          <p className="text-center font-inter text-base font-normal leading-7 text-white/70">
            Every gift keeps Scripture free, clear, and accessible for everyone, everywhere.
          </p>

          {/* Donation form */}
          <form onSubmit={handleDonate} className="mt-4 flex w-full flex-col gap-5">
            {/* Monthly / One-time toggle */}
            <div
              className="flex w-full rounded-full bg-black/40 p-1"
              role="tablist"
              aria-label="Donation frequency"
            >
              {(["monthly", "once"] as const).map((c) => {
                const active = cadence === c;
                return (
                  <button
                    key={c}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setCadence(c)}
                    className={`flex-1 rounded-full py-3 font-inter text-sm font-semibold transition-colors md:text-base ${
                      active
                        ? "bg-brand-tan text-black shadow-lg"
                        : "text-white/70 hover:text-white"
                    }`}
                  >
                    {c === "monthly" ? "Monthly" : "One-time"}
                  </button>
                );
              })}
            </div>

            {/* Preset amount chips */}
            <div className="grid grid-cols-3 gap-3">
              {PRESETS.map((v) => {
                const selected = !customInput && v === amount;
                return (
                  <button
                    key={v}
                    type="button"
                    onClick={() => {
                      setAmount(v);
                      setCustomInput("");
                    }}
                    className={`flex h-14 items-center justify-center rounded-xl border font-inter text-lg font-semibold transition-all ${
                      selected
                        ? "border-brand-tan bg-brand-tan text-black shadow-[0_0_24px_rgb(var(--brand-tan)/0.35)]"
                        : "border-brand-tan/40 bg-brand-tan/10 text-brand-tan hover:border-brand-tan hover:bg-brand-tan/20"
                    }`}
                  >
                    ${v}
                  </button>
                );
              })}
            </div>

            {/* Custom amount */}
            <div className="flex items-center gap-3 rounded-xl border border-dashed border-white/20 px-4 py-3 transition-colors focus-within:border-brand-tan">
              <span className="font-inter text-base font-semibold text-white/60">$</span>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                placeholder="Other amount"
                value={customInput}
                onChange={(e) => {
                  const v = e.target.value.replace(/\D/g, "");
                  setCustomInput(v);
                }}
                className="w-full bg-transparent font-inter text-base text-white placeholder-white/40 outline-none focus-visible:border-transparent focus-visible:shadow-none"
                aria-label="Custom donation amount"
              />
            </div>

            {/* CTA */}
            <button
              type="submit"
              disabled={effectiveAmount < 1}
              className="mt-2 flex w-full items-center justify-center rounded-full bg-brand-tan py-5 font-inter text-lg font-bold text-black shadow-lg transition-[background-color,opacity] duration-200 hover:bg-brand-tan-hover disabled:opacity-40"
            >
              Give ${effectiveAmount}
              {cadence === "monthly" ? " / month" : ""}
            </button>

            {/* Trust badges */}
            <div className="mt-2 flex items-center justify-center gap-6">
              <span className="flex items-center gap-1.5 font-inter text-xs text-white/50">
                <ShieldCheck size={14} strokeWidth={1.75} aria-hidden="true" />
                501(c)(3) nonprofit
              </span>
              <span className="flex items-center gap-1.5 font-inter text-xs text-white/50">
                <Lock size={14} strokeWidth={1.75} aria-hidden="true" />
                Secure
              </span>
            </div>

            {/* Footer note */}
            <p className="mt-2 text-center font-inter text-xs font-normal text-white/55">
              Click "Give" and our team will follow up with a secure donation link. Your gift is tax-deductible.
            </p>
          </form>
        </Reveal>
      </Section>
      </main>

      <Footer />
    </div>
  );
}
