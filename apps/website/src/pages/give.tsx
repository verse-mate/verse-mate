import React, { useState } from "react";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";

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
      <Header />

      {/* Hero Section */}
      <section
        className="w-full bg-cover bg-center px-6 pt-24 pb-12 md:px-12 md:py-16 lg:px-16 lg:py-20 xl:px-[120px] xl:py-24"
        style={{
          backgroundImage:
            "linear-gradient(90deg, rgba(0, 0, 0, 0.7) 0%, rgba(0, 0, 0, 0.3) 100%), url('/give.png')",
        }}
      >
        <div className="mx-auto flex max-w-[1440px] flex-col gap-8 md:gap-12 lg:gap-16">
          {/* Title */}
          <h1 className="font-inter text-2xl font-bold uppercase leading-8 tracking-[0.1em] text-white inline-block py-2 border-b-[6px] border-brand-tan w-fit">
            SUPPORT VERSEMATE
          </h1>

          {/* Content */}
          <div className="flex flex-col gap-4 max-w-full lg:max-w-[1200px]">
            <h2 className="font-merriweather text-3xl font-bold leading-tight text-white md:text-4xl md:leading-tight lg:text-5xl lg:leading-[64px]">
              Help People Everywhere Engage with God's Word
            </h2>

            <div className="flex flex-col gap-4 font-inter text-base font-light leading-6 text-white md:text-lg md:leading-7 lg:text-xl lg:leading-8 xl:text-2xl xl:leading-8">
              <p>
                Your generosity helps us create resources and tools that make
                Scripture clear and accessible to people worldwide. Every gift
                you give makes a direct impact—whether it's supporting the
                translation of content, improving our technology, or helping us
                reach new communities with the truth of God's Word.
              </p>
              <p>
                Through your partnership, VerseMate can continue developing
                simple, powerful tools that guide people not only to read the
                Bible, but to truly understand and apply it in their daily
                lives. We believe that when people engage Scripture with
                clarity, transformation follows—families are encouraged, faith
                grows stronger, and entire communities can be renewed.
              </p>
              <p>
                Thank you for prayerfully considering a gift to VerseMate.
                Together, we can equip more people across languages and
                cultures to connect with God's Word in a deeper way.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Donation Menu — mirrors the app's Giving screen */}
      <section className="w-full bg-brand-dark-gray px-6 py-16 md:px-12 md:py-20 lg:px-16 lg:py-24 xl:px-[120px]">
        <div className="mx-auto flex max-w-[560px] flex-col items-center gap-8">
          {/* Kicker */}
          <div className="flex flex-col items-center gap-3">
            <p className="font-inter text-xs font-semibold uppercase tracking-[0.2em] text-brand-tan">
              Give Today
            </p>
            <div className="h-[1px] w-12 bg-brand-tan opacity-60" />
          </div>

          {/* Headline */}
          <h2 className="font-merriweather text-center text-3xl font-normal leading-tight text-white md:text-4xl md:leading-[52px]">
            Give the Word to the world.
          </h2>

          {/* Lead */}
          <p className="text-center font-inter text-base font-light leading-7 text-white/70">
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
                        ? "border-brand-tan bg-brand-tan text-black shadow-[0_0_24px_rgba(194,178,145,0.35)]"
                        : "border-brand-tan/40 bg-brand-tan/10 text-brand-tan hover:border-brand-tan hover:bg-brand-tan/20"
                    }`}
                  >
                    ${v}
                  </button>
                );
              })}
            </div>

            {/* Custom amount */}
            <div className="flex items-center gap-3 rounded-xl border border-dashed border-white/20 px-4 py-3">
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
                className="w-full bg-transparent font-inter text-base text-white placeholder-white/40 outline-none"
                aria-label="Custom donation amount"
              />
            </div>

            {/* CTA */}
            <button
              type="submit"
              disabled={effectiveAmount < 1}
              className="mt-2 flex w-full items-center justify-center gap-2 rounded-full bg-brand-tan py-5 font-inter text-lg font-bold text-black shadow-lg transition-opacity hover:bg-opacity-90 disabled:opacity-40"
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="currentColor"
                aria-hidden="true"
              >
                <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
              </svg>
              Give ${effectiveAmount}
              {cadence === "monthly" ? " / month" : ""}
            </button>

            {/* Trust badges */}
            <div className="mt-2 flex items-center justify-center gap-6">
              <span className="flex items-center gap-1.5 font-inter text-xs text-white/50">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                  <path d="m9 12 2 2 4-4" />
                </svg>
                501(c)(3) nonprofit
              </span>
              <span className="flex items-center gap-1.5 font-inter text-xs text-white/50">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
                Secure
              </span>
            </div>

            {/* Footer note */}
            <p className="mt-2 text-center font-inter text-xs font-light text-white/40">
              Click "Give" and our team will follow up with a secure donation link. Your gift is tax-deductible.
            </p>
          </form>
        </div>
      </section>

      <Footer />
    </div>
  );
}
