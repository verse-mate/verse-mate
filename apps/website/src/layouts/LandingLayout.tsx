import Footer from "@/sections/desktop/Footer";
import Header from "@/sections/desktop/Header";
import type { ReactNode } from "react";

interface LandingLayoutProps {
  children: ReactNode;
}

export default function LandingLayout({ children }: LandingLayoutProps) {
  return (
    <div className="min-h-screen">
      <Header />
      {children}
      <Footer />
    </div>
  );
}
