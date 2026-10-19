import Seo from "@/components/Seo";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import InviteAddress from "@/components/coach/InviteAddress";
import useCoachReveal from "@/components/coach/useCoachReveal";
import {
  NOTETAKER_CONNECT_URL,
  NOTETAKER_INVITE_ADDRESS,
  NOTETAKER_LINKS,
  NOTETAKER_SUPPORT_ADDRESS,
} from "@/lib/notetaker";

export default function CoachNotetaker() {
  useCoachReveal();

  return (
    <div className="flex min-h-screen flex-col">
      <Seo
        title="Connect Zoom · VerseMate Coaching"
        description="Coaches in the VerseMate program: connect your Zoom account once and invite the recorder to the classes you want coached. It records the class for your coaching report."
      />

      <Header />

      <main id="main-content" className="coach-page">
        {/* HERO */}
        <header className="hero">
          <div className="wrap hero-inner">
            <div className="hero-copy">
              <span className="hero-eyebrow">For coaches in the program</span>
              <h1>
                Your classes, <em>recorded for coaching.</em>
              </h1>
              <p className="hero-sub">
                Connect your Zoom account once, then invite the recorder to the
                classes you want coached. It joins as{" "}
                <b>VerseMate Coaching</b>, records the class, and your coaching
                report follows.
              </p>
              <div className="hero-ctas">
                <a className="btn btn-primary" href={NOTETAKER_CONNECT_URL}>
                  Connect your Zoom account
                </a>
                <a className="btn btn-ghost" href="#steps">
                  How it works
                </a>
              </div>
              <p className="nt-note">
                You&apos;ll sign in to Zoom and click <b>Allow</b>. Nothing to
                install.
              </p>
            </div>

            <div
              className="score-card-hero nt-card"
              aria-label="A Zoom class that invites the recorder"
            >
              <div className="score-head">
                <div>
                  <h3>Saturday Bible Study</h3>
                  <div className="meta">Zoom · Schedule meeting</div>
                </div>
                <span
                  className="badge strong"
                  style={{ fontSize: "10px", padding: "5px 10px" }}
                >
                  RECORDED
                </span>
              </div>
              <div className="dim-row">
                <span className="dn">When</span>
                <span className="nt-val">Saturdays, 9:00 AM</span>
              </div>
              <div className="dim-row">
                <span className="dn">Invitees</span>
                <span className="nt-val">
                  <span className="badge strong nt-badge-address">
                    {NOTETAKER_INVITE_ADDRESS}
                  </span>
                </span>
              </div>
              <div className="dim-row">
                <span className="dn">Joins as</span>
                <span className="nt-val">VerseMate Coaching</span>
              </div>
              <div className="dim-row">
                <span className="dn">Report</span>
                <span className="nt-val">After each class</span>
              </div>
            </div>
          </div>
        </header>

        {/* STEPS */}
        <section className="method" id="steps">
          <div data-reveal className="wrap">
            <div className="s-head-center">
              <span className="eyebrow">How it works</span>
              <h2 className="s-title">
                Connect once. <em>Invite it to each class.</em>
              </h2>
              <p className="s-lead">
                Three steps, and only the first one is a setup. After that,
                inviting the recorder is part of scheduling your class.
              </p>
            </div>

            <div className="phases-grid phases-3">
              <div className="phase">
                <div className="phase-num">01</div>
                <div className="phase-name">Connect</div>
                <p className="phase-desc">
                  Click <b>Connect your Zoom account</b>, sign in to Zoom and
                  click <b>Allow</b>. You do this once.
                </p>
              </div>
              <div className="phase">
                <div className="phase-num">02</div>
                <div className="phase-name">Invite</div>
                <p className="phase-desc">
                  When you schedule a class in Zoom, add the address below under{" "}
                  <b>Invitees</b>, or invite it from your calendar. For a weekly
                  class, invite it once to the series.
                </p>
              </div>
              <div className="phase">
                <div className="phase-num">03</div>
                <div className="phase-name">Teach</div>
                <p className="phase-desc">
                  Start the class as usual, signed in to the same Zoom account.
                  The recorder joins, Zoom tells everyone the class is being
                  recorded, and your coaching report follows.
                </p>
              </div>
            </div>

            <div className="nt-invite">
              <p>The address to invite:</p>
              <InviteAddress />
            </div>
          </div>
        </section>

        {/* GOOD TO KNOW */}
        <section className="benefits">
          <div data-reveal className="wrap s-head-center">
            <span className="eyebrow">Good to know</span>
            <h2 className="s-title">
              It only records <em>what you invite it to.</em>
            </h2>
          </div>

          <div data-reveal className="wrap">
            <div className="benefit-grid">
              <div className="benefit">
                <div className="benefit-num">01</div>
                <h4>Invited classes only</h4>
                <p>
                  It never joins a meeting that doesn&apos;t invite it, and
                  never instant or personal-room meetings.
                </p>
              </div>
              <div className="benefit">
                <div className="benefit-num">02</div>
                <h4>You open the door</h4>
                <p>
                  Zoom lets it in only while you are in the class, signed in to
                  the account you connected. It waits up to 30 minutes for you.
                </p>
              </div>
              <div className="benefit">
                <div className="benefit-num">03</div>
                <h4>Your data</h4>
                <p>
                  Video and audio are deleted after 90 days; transcripts are
                  kept for your coaching. Nothing is sold or used to train AI.
                </p>
              </div>
              <div className="benefit">
                <div className="benefit-num">04</div>
                <h4>Stop any time</h4>
                <p>
                  Remove <i>VerseMate Notetaker</i> under <i>Added Apps</i> in
                  Zoom. We delete your connection and meeting data at once.
                </p>
              </div>
            </div>
            <p className="nt-links">
              <a href={NOTETAKER_LINKS.guide}>Guide</a> ·{" "}
              <a href={NOTETAKER_LINKS.privacy}>Privacy policy</a> ·{" "}
              <a href={NOTETAKER_LINKS.terms}>Terms of use</a> · Help:{" "}
              <a href={`mailto:${NOTETAKER_SUPPORT_ADDRESS}`}>
                {NOTETAKER_SUPPORT_ADDRESS}
              </a>
            </p>
          </div>
        </section>

        {/* FINAL CTA */}
        <section className="final">
          <div data-reveal className="wrap">
            <h2>
              Ready for your
              <br />
              <em>next class?</em>
            </h2>
            <p>
              Connect your Zoom account now; it takes less than a minute.
            </p>
            <a
              className="btn btn-primary"
              href={NOTETAKER_CONNECT_URL}
              style={{ padding: "20px 44px", fontSize: "16px" }}
            >
              Connect your Zoom account
            </a>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
