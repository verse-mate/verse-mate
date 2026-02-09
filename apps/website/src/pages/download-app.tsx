import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import DownloadApp from "@/components/sections/shared/DownloadApp";

export default function DownloadAppPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="flex-1">
        <DownloadApp />
      </main>
      <Footer />
    </div>
  );
}
