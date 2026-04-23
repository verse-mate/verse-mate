import { navigateToLogin } from "@/lib/navigation";
import Link from "next/link";
import Image from "next/image";
import { useState } from "react";

export default function Header() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const toggleMenu = () => {
    setIsMenuOpen(!isMenuOpen);
  };

  return (
    <>
      <header className="absolute left-0 right-0 top-0 z-[1000] bg-white transition-all duration-300">
        <div className="mx-auto flex w-full max-w-[1440px] items-center justify-between px-4 py-0 h-[76px] md:px-8 xl:px-16">
          {/* Logo */}
          <div className="flex-shrink-0">
            <Link href="/" className="relative flex items-center">
              <Image
                src="/versemate-logo.png"
                alt="VerseMate"
                width={120}
                height={32}
                className="object-contain md:w-[175px] md:h-[48px]"
              />
            </Link>
          </div>

          {/* Desktop Navigation - Temporarily disabled */}
          {/* <nav className="hidden md:flex md:gap-8 md:items-center">
            <Link
              href="/"
              className="font-inter text-base font-medium leading-6 text-black opacity-60 hover:opacity-100 transition-opacity no-underline"
            >
              Home
            </Link>
            <Link
              href="/volunteer"
              className="font-inter text-base font-medium leading-6 text-black opacity-60 hover:opacity-100 transition-opacity no-underline"
            >
              Volunteer
            </Link>
            <Link
              href="/give"
              className="font-inter text-base font-medium leading-6 text-black opacity-60 hover:opacity-100 transition-opacity no-underline"
            >
              Give
            </Link>
            <Link
              href="/about"
              className="font-inter text-base font-medium leading-6 text-black opacity-60 hover:opacity-100 transition-opacity no-underline"
            >
              About
            </Link>
            <button
              onClick={() => navigateToLogin()}
              className="font-inter text-base font-medium leading-6 text-black opacity-60 hover:opacity-100 transition-opacity cursor-pointer border-none bg-transparent"
            >
              Login
            </button>
          </nav> */}

          {/* CTA Buttons - Volunteer, Coach, Give */}
          <div className="flex items-center gap-2 md:gap-3">
            <Link
              href="/volunteer"
              className="flex items-center justify-center rounded-full border-none bg-black px-3 py-3 font-inter text-[11px] font-semibold leading-4 text-white no-underline whitespace-nowrap md:px-6 md:py-4 md:text-base md:font-normal md:leading-6 md:h-[56px]"
            >
              Volunteer
            </Link>
            <Link
              href="/coach"
              className="flex items-center justify-center rounded-full border-none bg-black px-3 py-3 font-inter text-[11px] font-semibold leading-4 text-white no-underline whitespace-nowrap md:px-6 md:py-4 md:text-base md:font-normal md:leading-6 md:h-[56px]"
            >
              Coach
            </Link>
            <Link
              href="/give"
              className="flex items-center justify-center rounded-full border-none bg-black px-3 py-3 font-inter text-[11px] font-semibold leading-4 text-white no-underline whitespace-nowrap md:px-6 md:py-4 md:text-base md:font-normal md:leading-6 md:h-[56px]"
            >
              Give
            </Link>
          </div>

          {/* Mobile Hamburger Menu - Temporarily disabled */}
          {/* <button
            onClick={toggleMenu}
            className="flex md:hidden ml-4 cursor-pointer flex-col items-center justify-center border-none bg-transparent p-0 w-6 h-6"
            aria-label="Toggle menu"
          >
            <div
              className="w-5 h-0.5 bg-black transition-all duration-300"
              style={{
                transform: isMenuOpen
                  ? "rotate(45deg) translate(6px, 6px)"
                  : "none",
              }}
            />
            <div
              className="w-5 h-0.5 bg-black my-[3px] transition-all duration-300"
              style={{ opacity: isMenuOpen ? 0 : 1 }}
            />
            <div
              className="w-5 h-0.5 bg-black transition-all duration-300"
              style={{
                transform: isMenuOpen
                  ? "rotate(-45deg) translate(6px, -6px)"
                  : "none",
              }}
            />
          </button> */}
        </div>
      </header>

      {/* Mobile Menu Overlay - Temporarily disabled */}
      {/* {isMenuOpen && (
        <div
          className="fixed left-0 right-0 bottom-0 top-[76px] z-[999] flex flex-col items-center bg-black/95 pt-12 md:hidden"
          onClick={() => setIsMenuOpen(false)}
        >
            <nav className="flex flex-col items-center gap-8">
              <Link
                href="/"
                onClick={() => setIsMenuOpen(false)}
                className="font-merriweather font-bold text-2xl leading-8 text-center text-white no-underline"
              >
                Home
              </Link>
              <Link
                href="/volunteer"
                onClick={() => setIsMenuOpen(false)}
                className="font-merriweather font-bold text-2xl leading-8 text-center text-white no-underline"
              >
                Volunteer
              </Link>
              <Link
                href="/give"
                onClick={() => setIsMenuOpen(false)}
                className="font-merriweather font-bold text-2xl leading-8 text-center text-white no-underline"
              >
                Give
              </Link>
              <Link
                href="/about"
                onClick={() => setIsMenuOpen(false)}
                className="font-merriweather font-bold text-2xl leading-8 text-center text-white no-underline"
              >
                About
              </Link>
              <button
                onClick={() => {
                  navigateToLogin();
                  setIsMenuOpen(false);
                }}
                className="font-merriweather font-bold text-2xl leading-8 text-center text-white cursor-pointer border-none bg-transparent"
              >
                Login
              </button>
            </nav>
          </div>
      )} */}
    </>
  );
}
