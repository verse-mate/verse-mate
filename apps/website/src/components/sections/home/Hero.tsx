"use client";

import { navigateToApp } from "@/lib/navigation";
import Link from "next/link";

export default function Hero() {
  return (
    <section className="relative w-full max-w-full h-[901px] md:h-[1270px] lg:h-[1000px] xl:h-[900px] overflow-hidden bg-hero-gradient">
      {/* Text Pattern Overlay - Different images for mobile/tablet/desktop */}
      <div
        className="absolute inset-0 bg-cover bg-center bg-no-repeat md:hidden"
        style={{
          backgroundImage: "url('/Tilted%20Image%20text%20Mobile.png')",
          opacity: 0.4,
        }}
      />
      <div
        className="hidden md:block xl:hidden absolute inset-0 bg-cover bg-center bg-no-repeat"
        style={{
          backgroundImage: "url('/Tilted%20Image%20text%20Mobile.png')",
          opacity: 0.05,
        }}
      />
      <div
        className="hidden xl:block absolute inset-0 bg-cover bg-center bg-no-repeat"
        style={{
          backgroundImage: "url('/Tilted%20image%20text%20Desktop.png')",
          opacity: 0.5,
        }}
      />

      {/* Content Wrapper */}
      <div className="relative md:mx-auto md:w-[1024px] xl:w-[1440px] xl:h-full">
        {/* Content */}
        <div className="absolute left-0 right-0 top-[76px] flex flex-col items-start isolate px-6 pt-20 gap-4 h-[432px] md:px-16 md:pt-20 md:gap-4 lg:px-14 lg:pt-16 lg:gap-6 xl:justify-center xl:h-[752px] xl:px-[120px] xl:pt-8">
          {/* Main Heading */}
          <h1 className="font-merriweather font-bold text-white text-[32px] leading-10 w-full max-w-[392px] m-0 md:text-5xl md:leading-[64px] md:max-w-[896px] lg:text-[44px] lg:leading-[56px] lg:max-w-[700px] xl:text-5xl xl:leading-[64px] xl:w-[540px]">
            The Bible Was Meant to Be Understood - Not Just Read.
          </h1>

          {/* Description Text */}
          <p className="font-inter font-normal text-white text-base leading-6 w-full max-w-[392px] m-0 md:text-2xl md:leading-8 md:max-w-[896px] lg:text-xl lg:leading-7 lg:max-w-[700px] xl:text-2xl xl:leading-8 xl:w-[540px]">
            When people truly understand Scripture, lives change. Versemate helps
            anyone, anywhere, connect with God&rsquo;s Word clearly - and grow
            deeper in faith.
          </p>

          {/* Button Container */}
          <div className="flex flex-row items-start gap-6 w-full max-w-[392px] pt-6 md:max-w-[436px] md:gap-6 md:pt-6">
            {/* Primary Button - Try Versemate (outline) */}
            <Link
              href="/"
              onClick={(e) => {
                e.preventDefault();
                navigateToApp();
              }}
              className="flex flex-row items-center justify-center cursor-pointer no-underline bg-transparent border-2 border-white rounded-full w-[206px] h-[50px] px-5 py-3.5 md:h-20 md:px-8 md:py-6"
            >
              <span className="font-inter text-white font-semibold text-sm leading-[22px] whitespace-nowrap md:text-xl md:leading-8">
                Try Versemate
              </span>
            </Link>

            {/* Secondary Button - Get the app (solid) */}
            <Link
              href="/download-app"
              className="flex flex-row items-center justify-center cursor-pointer no-underline bg-white border-none rounded-full w-[206px] h-[50px] px-5 py-3.5 md:h-20 md:px-8 md:py-6"
            >
              <span className="font-inter text-black font-semibold text-sm leading-[22px] whitespace-nowrap md:text-xl md:leading-8">
                Get the app
              </span>
            </Link>
          </div>
        </div>

        {/* Bottom Text Line */}
        <div className="absolute flex flex-row items-center justify-center left-0 right-0 h-8 gap-2 bottom-10 md:top-[1197px] md:bottom-auto lg:bottom-20 lg:top-auto xl:w-[1440px] xl:left-1/2 xl:-translate-x-1/2 xl:bottom-[72px]">
          <span className="font-inter font-normal text-center text-white whitespace-nowrap text-base leading-6 tracking-[0.2em] w-[374px] md:text-2xl md:leading-8 md:w-[561px]">
            Always free. For everyone. Forever.
          </span>
        </div>
      </div>

      {/* Hero Image Container */}
      <div className="absolute z-10 w-[392px] h-[400px] left-1/2 -translate-x-1/2 top-[500px] md:w-[940px] md:h-[679px] md:top-[600px] lg:w-[650px] lg:h-[470px] lg:top-[540px] xl:w-[776px] xl:h-[1033px] xl:right-[45px] xl:top-[115px] xl:left-auto xl:translate-x-0">
        {/* Shadow - Desktop only */}
        <div className="hidden xl:block absolute w-[776px] h-[25px] -right-[0.41px] top-[510px] bg-black/75 blur-[20px]" />

        {/* Hero Images */}
        <div className="absolute flex flex-col items-start z-10 w-full h-full xl:w-[820px] xl:h-[1033px] xl:-right-20 xl:top-[90px]">
          {/* Background iPad View */}
          <img
            src="/ipad.png"
            alt="Desktop View"
            className="absolute h-auto z-10 right-0 top-0 w-full max-w-[412px] rounded-xl md:max-w-none xl:w-full"
          />

          {/* Middle Bible Reader View */}
          <img
            src="/bibleReader.png"
            alt="Bible Reader View"
            className="absolute z-20 left-[17%] top-[10%] w-[45%] aspect-[160/198] rounded-[10px] md:left-[15%] md:top-[8%] xl:left-[15%] xl:top-[8%]"
          />

          {/* Front Summary View */}
          <img
            src="/summary.png"
            alt="Summary View"
            className="absolute z-30 right-[33%] top-[17%] w-[33%] aspect-[108/175] rounded-2xl md:left-[36%] md:right-auto md:top-[15%] xl:left-[36%] xl:right-auto xl:top-[15%]"
          />
        </div>
      </div>
    </section>
  );
}
