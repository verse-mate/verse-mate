import Seo from "@/components/Seo";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import DownloadApp from "@/components/sections/shared/DownloadApp";

export default function DownloadAppPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <Seo
        title="Get the App — VerseMate"
        description="Download VerseMate for iOS and Android. No paywalls. No clutter. Just the truth of God's Word, made simple."
      />
      <Header />
      <main id="main-content" className="flex-1">
        <DownloadApp />
      </main>
      <Footer />
    </div>
  );
}
