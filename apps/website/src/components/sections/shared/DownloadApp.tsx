export default function DownloadApp() {
  return (
    <section className="w-full bg-[#F6F3EC] relative pt-[120px] min-h-screen">
      {/* Content Container */}
      <div className="mx-auto flex w-full flex-col items-start px-4 pb-12 gap-8 md:max-w-[1024px] md:px-16 md:pb-[91px] md:flex-row md:justify-between md:items-start md:gap-0 xl:max-w-[1440px] xl:px-[120px] xl:pb-[80px] relative">
        {/* Text Line - Always free (Desktop Only) */}
        <div className="hidden md:flex absolute left-0 right-0 bottom-10 flex-row justify-center items-center gap-2 h-8 z-0">
          <span className="font-inter font-normal text-2xl leading-8 text-center tracking-[0.2em] text-[#3E464D]">
            Always free. For everyone. Forever.
          </span>
        </div>

        {/* Text Content */}
        <div className="flex flex-col justify-center items-start gap-8 w-full md:max-w-[523px] md:gap-10 xl:max-w-[651px] z-[1]">
          {/* Main Content */}
          <div className="flex flex-col items-start gap-4 w-full">
            {/* Main Heading */}
            <h1 className="font-merriweather font-bold text-[32px] leading-[40px] text-black m-0 w-full md:text-5xl md:leading-[64px]">
              Understand God&rsquo;s Word with VerseMate
            </h1>

            {/* Subheading */}
            <p className="font-inter font-normal text-base leading-6 text-[#3E464D] m-0 w-full md:text-2xl md:leading-8">
              When people truly understand Scripture, lives change.
            </p>

            {/* Description */}
            <p className="font-inter font-normal text-base leading-6 text-[#3E464D] m-0 w-full md:text-2xl md:leading-8">
              VerseMate helps anyone, anywhere explore God&rsquo;s Word with
              clarity and faithful insight. Choose your depth—Summary,
              Line-by-Line, or In-Depth Study. Available in multiple Bible
              versions and languages.
            </p>
          </div>

          {/* Download Section */}
          <div className="flex flex-col items-start gap-2 w-full">
            {/* Download VerseMate Now */}
            <h2 className="font-inter font-bold text-xl leading-6 text-black m-0 w-full md:text-2xl md:leading-8">
              Download VerseMate Now
            </h2>

            {/* Description */}
            <p className="font-inter font-normal text-base leading-6 text-[#3E464D] m-0 w-full md:text-2xl md:leading-8">
              No paywalls. No clutter.
              <br />
              Just the truth of God&rsquo;s Word, made simple.
            </p>

            {/* App Store Buttons Container */}
            <div className="flex flex-row items-center gap-3.5 w-full h-[58px]">
              {/* App Store Button */}
              <a
                href="https://apps.apple.com/us/app/verse-mate/id6756897180"
                target="_blank"
                rel="noopener noreferrer"
                className="flex flex-col justify-center items-center py-2 gap-2 flex-1 h-[58px] bg-black rounded-lg no-underline"
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
                className="flex flex-col justify-center items-center py-2 gap-2 flex-1 h-[58px] bg-black rounded-lg no-underline"
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
        <div className="w-full mx-auto md:mt-0 md:w-full md:max-w-[499px] md:mx-0 z-[2]">
          <img
            src="/versemate-app-mockup.png"
            alt="VerseMate App Interface"
            className="w-full h-auto object-contain"
          />
        </div>

        {/* Text Line - Always free (Mobile Only) */}
        <div className="flex md:hidden flex-row justify-center items-center gap-2 h-8 w-full">
          <span className="font-inter font-normal text-base leading-6 text-center tracking-[0.2em] text-[#3E464D]">
            Always free. For everyone. Forever.
          </span>
        </div>
      </div>
    </section>
  );
}
