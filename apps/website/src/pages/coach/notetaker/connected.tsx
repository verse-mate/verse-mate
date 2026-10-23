import Head from "next/head";
import Link from "next/link";
import Seo from "@/components/Seo";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import InviteAddress from "@/components/coach/InviteAddress";
import { NOTETAKER_LINKS, NOTETAKER_SUPPORT_ADDRESS } from "@/lib/notetaker";

/** Where Zoom's sign-in ends when it was started on /coach/notetaker. */
export default function CoachNotetakerConnected() {
  return (
    <div className="flex min-h-screen flex-col">
      <Seo
        title="Zoom connected · VerseMate Coaching"
        description="Your Zoom account is connected to the VerseMate coaching recorder."
      />
      <Head>
        <meta name="robots" content="noindex" />
      </Head>

      <Header />

      <main id="main-content" className="coach-page">
        <header className="hero">
          <div className="wrap nt-connected">
            <span className="hero-eyebrow">Zoom connected</span>
            <h1>
              You&apos;re connected. <em>One more step.</em>
            </h1>
            <p className="hero-sub">
              The recorder joins only the classes that invite it. When you
              schedule a class in Zoom, add this address under{" "}
              <b>Invitees</b>, or invite it from your calendar:
            </p>

            <InviteAddress onDark />

            <ol className="nt-steps">
              <li>
                In Zoom, open <b>Meetings</b> and schedule your class (or edit
                one you already have).
              </li>
              <li>
                Under <b>Invitees</b>, add the address above and save. For a
                weekly class, invite it once to the series.
              </li>
              <li>
                Start the class as usual, signed in to the Zoom account you just
                connected. <b>VerseMate Coaching</b> joins and Zoom tells
                everyone the class is being recorded.
              </li>
            </ol>

            <div className="hero-ctas">
              <Link className="btn btn-ghost" href="/coach/notetaker/">
                Back to how it works
              </Link>
            </div>

            <p className="nt-links">
              To stop, remove <i>VerseMate Notetaker</i> under{" "}
              <i>Added Apps</i> in Zoom. <a href={NOTETAKER_LINKS.guide}>Guide</a>{" "}
              · Help:{" "}
              <a href={`mailto:${NOTETAKER_SUPPORT_ADDRESS}`}>
                {NOTETAKER_SUPPORT_ADDRESS}
              </a>
            </p>
          </div>
        </header>
      </main>

      <Footer />
    </div>
  );
}
