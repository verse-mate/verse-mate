import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import Button from "@/components/ui/Button";
import { cn } from "@/lib/cn";

const NAV_LINK =
  "whitespace-nowrap font-inter text-sm font-medium text-brand-dark-gray no-underline transition-colors duration-200 hover:text-brand-gold md:text-base";

export default function Header() {
  const router = useRouter();
  const isActive = (href: string) => router.pathname === href;
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={cn(
        "sticky top-0 z-[1000] w-full bg-white transition-shadow duration-300",
        scrolled ? "shadow-header" : "shadow-none",
      )}
    >
      <div className="mx-auto flex h-[60px] w-full max-w-[1200px] items-center justify-between px-4 md:h-16 md:px-10 lg:px-16">
        {/* Logo */}
        <Link href="/" className="relative flex flex-shrink-0 items-center">
          <Image
            src="/versemate-logo.png"
            alt="VerseMate home"
            width={148}
            height={40}
            priority
            className="h-7 w-auto object-contain md:h-[42px]"
          />
        </Link>

        {/* Nav — secondary items as text links, Give as the primary action */}
        <nav className="flex items-center gap-3.5 sm:gap-5 md:gap-7" aria-label="Primary">
          <Link
            href="/volunteer"
            className={cn(NAV_LINK, isActive("/volunteer") && "text-brand-gold")}
            aria-current={isActive("/volunteer") ? "page" : undefined}
          >
            Volunteer
          </Link>
          <Link
            href="/coach"
            className={cn(NAV_LINK, isActive("/coach") && "text-brand-gold")}
            aria-current={isActive("/coach") ? "page" : undefined}
          >
            Coach
          </Link>
          <Link
            href="/give"
            className={cn(NAV_LINK, isActive("/give") && "text-brand-gold")}
            aria-current={isActive("/give") ? "page" : undefined}
          >
            Give
          </Link>
          <Button
            href="/login"
            variant="dark"
            size="sm"
            aria-current={isActive("/login") ? "page" : undefined}
          >
            Log in
          </Button>
        </nav>
      </div>
    </header>
  );
}
