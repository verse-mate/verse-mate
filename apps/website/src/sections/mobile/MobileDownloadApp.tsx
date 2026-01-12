"use client";

export default function MobileDownloadApp() {
  return (
    <section className="w-full self-stretch bg-[#F6F3EC] relative overflow-hidden isolate">
      {/* Content Container */}
      <div className="mx-auto flex w-full max-w-[440px] flex-col items-start px-4 pt-20 pb-12 sm:pb-14 gap-8 min-h-[1168px]">
      {/* Text Content */}
      <div className="flex flex-col justify-center items-start gap-8 w-full max-w-[408px]">
        {/* Main Content - Frame 6 */}
        <div className="flex flex-col items-start gap-4 w-full max-w-[408px]">
          {/* Main Heading - Understand God's Word with VerseMate */}
          <h1
            className="w-full max-w-[408px] font-merriweather font-bold text-[32px] leading-[40px] text-black m-0"
            style={{ textTransform: 'none' }}
          >
            Understand God&rsquo;s Word with VerseMate
          </h1>

          {/* Subheading - When people truly understand Scripture */}
          <p className="w-full max-w-[408px] h-12 font-inter font-normal text-base leading-6 text-[#3E464D] m-0">
            When people truly understand Scripture, lives change.
          </p>

          {/* Description - VerseMate helps anyone */}
          <p className="w-full max-w-[408px] h-[120px] font-inter font-normal text-base leading-6 text-[#3E464D] m-0">
            VerseMate helps anyone, anywhere explore God&rsquo;s Word with
            clarity and faithful insight. Choose your depth—Summary,
            Line-by-Line, or In-Depth Study. Available in multiple Bible
            versions and languages.
          </p>
        </div>

        {/* Download Section - Frame 7 */}
        <div className="flex flex-col items-start gap-2 w-full max-w-[408px]">
          {/* Download VerseMate Now */}
          <h2 className="w-full max-w-[408px] h-6 font-inter font-bold text-xl leading-6 text-black m-0">
            Download VerseMate Now
          </h2>

          {/* Description - No paywalls */}
          <p className="w-full max-w-[408px] h-12 font-inter font-normal text-base leading-6 text-[#3E464D] m-0">
            No paywalls. No clutter.
            <br />
            Just the truth of God&rsquo;s Word, made simple.
          </p>

          {/* App Store Buttons Container - Frame 5 */}
          <div className="flex flex-row items-center gap-[14px] w-full max-w-[408px] h-[58px]">
            {/* Frame 8 - App Store Button */}
            <a
              href="https://apps.apple.com/us/app/verse-mate/id6756897180"
              target="_blank"
              rel="noopener noreferrer"
              className="flex flex-col justify-center items-center py-2 gap-2 w-[197px] h-[58px] bg-black rounded-lg flex-grow no-underline"
            >
              <img
                src="/appStore.png"
                alt="Download on the App Store"
                className="w-[140px] h-[42px] rounded-lg"
              />
            </a>

            {/* Frame 9 - Google Play Button */}
            <a
              href="https://play.google.com/store/apps/details?id=org.versemate.app"
              target="_blank"
              rel="noopener noreferrer"
              className="flex flex-col justify-center items-center py-2 gap-2 w-[197px] h-[58px] bg-black rounded-lg flex-grow no-underline"
            >
              <img
                src="/googleStore.png"
                alt="Get it on Google Play"
                className="w-[140px] h-[42px] rounded-lg"
              />
            </a>
          </div>
        </div>
      </div>

      {/* Phone Mockup - Frame 4 1 */}
      <div className="w-full max-w-[408px] h-auto">
        <img
          src="/versemate-app-mockup.png"
          alt="VerseMate App Interface"
          className="w-full h-full object-contain"
        />
      </div>

      {/* Text Line - Always free */}
      <div className="flex flex-row justify-center items-center w-full max-w-[408px] h-auto">
        <span className="font-inter font-normal text-sm sm:text-base leading-6 text-center tracking-[0.15em] sm:tracking-[0.2em] text-[#3E464D] whitespace-nowrap px-2">
          Always free. For everyone. Forever.
        </span>
      </div>
      </div>
    </section>
  );
}
