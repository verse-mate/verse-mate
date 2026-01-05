export default function DownloadAppSection() {
  return (
    <section className="w-full bg-[#F6F3EC] relative overflow-hidden isolate">
      {/* Content Container */}
      <div className="max-w-[1440px] mx-auto px-8 md:px-12 lg:px-16 xl:px-[120px] py-12 md:py-16 lg:py-20 xl:py-[80px]">
        <div className="flex flex-col lg:flex-row lg:items-center gap-12 lg:gap-16 xl:gap-20">
          {/* Text Content */}
          <div className="flex flex-col gap-10 lg:flex-1 lg:max-w-[651px]">
            {/* Main Content */}
            <div className="flex flex-col gap-4">
              {/* Main Heading */}
              <h1 className="font-merriweather font-bold text-3xl sm:text-4xl lg:text-5xl leading-tight lg:leading-[64px] text-black m-0">
                Understand God&rsquo;s Word with VerseMate
              </h1>

              {/* Subheading */}
              <p className="font-inter font-normal text-lg sm:text-xl lg:text-2xl leading-8 text-[#3E464D] m-0">
                When people truly understand Scripture, lives change.
              </p>

              {/* Description */}
              <p className="font-inter font-normal text-lg sm:text-xl lg:text-2xl leading-8 text-[#3E464D] m-0">
                VerseMate helps anyone, anywhere explore God&rsquo;s Word with
                clarity and faithful insight. Choose your depth—Summary,
                Line-by-Line, or In-Depth Study. Available in multiple Bible
                versions and languages.
              </p>
            </div>

            {/* Download Section */}
            <div className="flex flex-col gap-2">
              {/* Download VerseMate Now */}
              <h2 className="font-inter font-bold text-lg sm:text-xl lg:text-2xl leading-8 text-[#1B1B1B] m-0">
                Download VerseMate Now
              </h2>

              {/* Description */}
              <p className="font-inter font-normal text-lg sm:text-xl lg:text-2xl leading-8 text-[#3E464D] m-0 mb-4">
                No paywalls. No clutter.
                <br />
                Just the truth of God&rsquo;s Word, made simple.
              </p>

              {/* App Store Buttons Container */}
              <div className="flex flex-row flex-wrap items-center gap-3.5">
                {/* App Store Button */}
                <a
                  href="https://apps.apple.com/us/app/verse-mate/id6756897180"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex flex-col justify-center items-center py-2 bg-black rounded-lg no-underline w-auto"
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
                  className="flex flex-col justify-center items-center py-2 bg-black rounded-lg no-underline w-auto"
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
          <div className="flex justify-center lg:justify-end lg:flex-1">
            <div className="w-full max-w-[400px] md:max-w-[450px] lg:max-w-[499px]">
              <img
                src="/versemate-app-mockup.png"
                alt="VerseMate App Interface"
                className="w-full h-auto object-contain"
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
