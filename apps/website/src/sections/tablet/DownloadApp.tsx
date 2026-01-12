export default function DownloadAppSection() {
  return (
    <section className="w-full self-stretch bg-[#F6F3EC] relative overflow-hidden isolate">
      {/* Content Container */}
      <div className="mx-auto flex w-full max-w-[1024px] flex-row justify-between items-start h-auto min-h-[976px] px-16 py-[91px]">
      {/* Text Line - Always free */}
      <div className="absolute left-0 right-0 bottom-10 flex flex-row justify-center items-center gap-2 h-8 z-0">
        <span className="font-inter font-normal text-2xl leading-8 text-center tracking-[0.2em] text-[#3E464D]">
          Always free. For everyone. Forever.
        </span>
      </div>

      {/* Text Content */}
      <div className="flex flex-col justify-center items-start gap-10 w-full max-w-[523px] z-[1]">
        {/* Main Content */}
        <div className="flex flex-col items-start gap-4 self-stretch">
          {/* Main Heading */}
          <h1 className="font-merriweather font-bold text-5xl leading-[64px] text-black m-0 self-stretch">
            Understand God&rsquo;s Word with VerseMate
          </h1>

          {/* Subheading */}
          <p className="font-inter font-normal text-2xl leading-8 text-[#3E464D] m-0 self-stretch">
            When people truly understand Scripture, lives change.
          </p>

          {/* Description */}
          <p className="font-inter font-normal text-2xl leading-8 text-[#3E464D] m-0 self-stretch">
            VerseMate helps anyone, anywhere explore God&rsquo;s Word with
            clarity and faithful insight. Choose your depth—Summary,
            Line-by-Line, or In-Depth Study. Available in multiple Bible
            versions and languages.
          </p>
        </div>

        {/* Download Section */}
        <div className="flex flex-col items-start gap-2 self-stretch">
          {/* Download VerseMate Now */}
          <h2 className="font-inter font-bold text-2xl leading-8 text-[#1B1B1B] m-0 self-stretch">
            Download VerseMate Now
          </h2>

          {/* Description */}
          <p className="font-inter font-normal text-2xl leading-8 text-[#3E464D] m-0 self-stretch">
            No paywalls. No clutter.
            <br />
            Just the truth of God&rsquo;s Word, made simple.
          </p>

          {/* App Store Buttons Container */}
          <div className="flex flex-row items-center gap-3.5 w-full max-w-[408px] h-[58px]">
            {/* App Store Button */}
            <a
              href="https://apps.apple.com/us/app/verse-mate/id6756897180"
              target="_blank"
              rel="noopener noreferrer"
              className="flex flex-col justify-center items-center py-2 gap-2 w-[197px] h-[58px] bg-black rounded-lg no-underline"
            >
              <img
                src="/appStore.png"
                alt="Download on the App Store"
                className="w-[140px] h-[42px] rounded-lg"
              />
            </a>

            {/* Google Play Button */}
            <a
              href="https://play.google.com/store/apps/details?id=org.versemate.app"
              target="_blank"
              rel="noopener noreferrer"
              className="flex flex-col justify-center items-center py-2 gap-2 w-[197px] h-[58px] bg-black rounded-lg no-underline"
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

      {/* Phone Mockup */}
      <div className="w-full max-w-[499px] h-auto z-[2]">
        <img
          src="/versemate-app-mockup.png"
          alt="VerseMate App Interface"
          className="w-full h-full object-contain"
        />
      </div>
      </div>
    </section>
  );
}
