import Image from "next/image";
import Link from "next/link";

export default function Footer() {
  return (
    <footer className="w-full bg-[#1B1B1B] flex flex-col items-center justify-center min-h-[80px] px-4 py-6 sm:min-h-[90px] sm:px-5 sm:py-7 md:min-h-[100px] md:px-6 md:py-8 lg:min-h-[140px] lg:px-8 lg:py-10 xl:min-h-[180px] xl:px-16 xl:py-12">
      {/* Page Links Container */}
      <div className="flex w-full max-w-[400px] flex-row items-center justify-between gap-4 sm:gap-5 md:gap-6 lg:max-w-[1312px] lg:gap-8 xl:gap-12">
        {/* Logo */}
        <div className="flex-shrink-0 max-w-[80px] sm:max-w-[90px] md:max-w-[100px] lg:max-w-[110px] xl:max-w-[124px]">
          <Link href="/" className="relative flex h-full items-center">
            <Image
              src="/versemate-logo.png"
              alt="VerseMate"
              width={124}
              height={34}
              className="w-full h-auto object-contain brightness-0 invert"
            />
          </Link>
        </div>

        {/* Privacy Policy Link */}
        <Link
          href="/privacy"
          className="font-inter font-normal text-white no-underline whitespace-nowrap transition-opacity duration-300 hover:opacity-70 active:opacity-70 text-[11px] leading-[18px] sm:text-xs sm:leading-5 md:text-[13px] md:leading-[22px] lg:text-sm lg:leading-6"
        >
          Privacy Policy
        </Link>
      </div>
    </footer>
  );
}
