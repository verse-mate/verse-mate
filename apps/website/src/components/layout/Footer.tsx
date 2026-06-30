import Image from "next/image";
import Link from "next/link";
import { getAppUrl, navigateToApp } from "@/lib/navigation";

const LINK_CLASS =
  "font-inter text-sm font-medium text-white/70 no-underline transition-colors duration-200 hover:text-white";

const FOOTER_LINKS = [
  { href: "/download-app", label: "Get the app" },
  { href: "/volunteer", label: "Volunteer" },
  { href: "/coach", label: "Coach" },
  { href: "/give", label: "Give" },
];

export default function Footer() {
  return (
    <footer className="w-full bg-brand-dark-gray text-white">
      <div className="mx-auto w-full max-w-[1200px] px-6 py-12 md:px-10 md:py-16 lg:px-16">
        {/* Top: logo + navigation */}
        <div className="flex flex-col items-start gap-8 border-b border-white/10 pb-8 md:flex-row md:items-center md:justify-between">
          <Link href="/" className="relative flex items-center">
            <Image
              src="/versemate-logo.png"
              alt="VerseMate home"
              width={148}
              height={40}
              className="h-9 w-auto object-contain brightness-0 invert"
            />
          </Link>

          <nav
            className="flex flex-wrap items-center gap-x-7 gap-y-3"
            aria-label="Footer"
          >
            <a
              href={getAppUrl()}
              onClick={(e) => {
                e.preventDefault();
                navigateToApp();
              }}
              className={LINK_CLASS}
            >
              Try Versemate
            </a>
            {FOOTER_LINKS.map((link) => (
              <Link key={link.href} href={link.href} className={LINK_CLASS}>
                {link.label}
              </Link>
            ))}
          </nav>
        </div>

        {/* Mission line */}
        <p className="mt-8 max-w-[680px] font-inter text-sm leading-6 text-white/70">
          Versemate is a 501(c)(3) nonprofit making the Bible easier to
          understand—for everyone, forever. Donations are tax-deductible in the
          U.S.
        </p>

        {/* Bottom: copyright + privacy */}
        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="font-inter text-xs text-white/50">
            © {new Date().getFullYear()} VerseMate. Built by believers. Guided by
            the Word.
          </p>
          <Link
            href="/privacy"
            className="font-inter text-xs font-medium text-white/70 no-underline transition-colors duration-200 hover:text-white"
          >
            Privacy Policy
          </Link>
        </div>
      </div>
    </footer>
  );
}
