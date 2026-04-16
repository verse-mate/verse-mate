import React, { useState } from "react";
import Head from "next/head";
import Link from "next/link";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";

type ChurchSize = "Under 100" | "100 – 500" | "500 – 2,000" | "2,000+";
type Role =
  | "Bible study leader"
  | "Small group leader"
  | "Church administrator"
  | "Senior pastor"
  | "Other";

export default function CoachLanding() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("Bible study leader");
  const [churchSize, setChurchSize] = useState<ChurchSize>("Under 100");
  const [notes, setNotes] = useState("");

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const subject = "VerseMate Coaching — Request for information";
    const body =
      `Name: ${name}\n` +
      `Email: ${email}\n` +
      `Role: ${role}\n` +
      `Church size: ${churchSize}\n\n` +
      `Notes:\n${notes.trim() || "(none)"}\n`;
    const href =
      "mailto:info@versemate.org" +
      `?subject=${encodeURIComponent(subject)}` +
      `&body=${encodeURIComponent(body)}`;
    window.location.href = href;
  };

  return (
    <div className="flex min-h-screen flex-col">
      <Head>
        <title>VerseMate Coaching — A coach for every Bible leader</title>
        <meta
          name="description"
          content="Weekly Bible leader coaching for study leaders, small group leaders, and church administrators. Structured feedback across 11 dimensions of Bible leadership. Request more information."
        />
      </Head>

      <Header />

      <main className="coach-page">
        {/* HERO */}
        <header className="hero">
          <div className="wrap hero-inner">
            <div className="hero-copy">
              <span className="hero-eyebrow">Bible Leader Coaching</span>
              <h1>
                A coach for every <em>Bible leader.</em>
              </h1>
              <p className="hero-sub">
                Weekly feedback that makes your teaching sharper, your small
                groups deeper, and your ministry stronger. Structured across 11
                dimensions of Bible leadership.
              </p>
              <div className="hero-ctas">
                <a className="btn btn-primary" href="#request">
                  Request more information →
                </a>
                <Link
                  href="/coach/sample"
                  target="_blank"
                  rel="noopener"
                  className="btn btn-ghost"
                >
                  See a sample report
                </Link>
              </div>
            </div>

            <div
              className="score-card-hero"
              aria-label="Sample coaching report"
            >
              <div className="score-head">
                <div>
                  <h3>Bible Leader Coaching</h3>
                  <div className="meta">Colossians Ch. 4 · Sample Report</div>
                </div>
                <span
                  className="badge target"
                  style={{ fontSize: "10px", padding: "5px 10px" }}
                >
                  ON TARGET
                </span>
              </div>
              <div className="score-big">
                38<span>/55 &nbsp;B+</span>
              </div>
              <div className="score-label">
                Overall Coaching Score · 11 Dimensions
              </div>
              <div className="dim-row">
                <span className="dn">Lesson Preparation</span>
                <span className="ds">5/5</span>
                <span className="badge strong">STRONG</span>
              </div>
              <div className="dim-row">
                <span className="dn">Biblical Accuracy</span>
                <span className="ds">5/5</span>
                <span className="badge strong">STRONG</span>
              </div>
              <div className="dim-row">
                <span className="dn">Question Quality</span>
                <span className="ds">3/5</span>
                <span className="badge target">ON TARGET</span>
              </div>
              <div className="dim-row">
                <span className="dn">Group Engagement</span>
                <span className="ds">4/5</span>
                <span className="badge target">ON TARGET</span>
              </div>
              <div className="dim-row">
                <span className="dn">Application</span>
                <span className="ds">2/5</span>
                <span className="badge needs">NEEDS WORK</span>
              </div>
              <div className="dim-row">
                <span
                  className="dn"
                  style={{ color: "var(--muted)", fontStyle: "italic" }}
                >
                  + 6 more dimensions
                </span>
                <span className="ds"></span>
                <span
                  className="badge"
                  style={{ background: "#eee", color: "#666" }}
                >
                  VIEW ALL
                </span>
              </div>
            </div>
          </div>
        </header>

        {/* WHO IT'S FOR */}
        <section className="who" id="who">
          <div className="wrap">
            <div className="s-head-center">
              <span className="eyebrow">Who it&apos;s for</span>
              <h2 className="s-title">
                Built for <em>every Bible leader.</em>
              </h2>
              <p className="s-lead">
                Whether you&apos;re teaching the adult class, leading a home
                group, or overseeing a whole church&apos;s teaching ministry,
                you get coaching calibrated to your role.
              </p>
            </div>

            <div className="who-grid">
              <article className="who-card">
                <div className="who-icon" aria-hidden="true">
                  📖
                </div>
                <h3>Bible study leaders</h3>
                <p>
                  Teaching a class, Sunday school, or adult group? Get specific
                  feedback on your lessons, questions, and applications. Know
                  exactly what to try next week.
                </p>
                <div className="who-widget">
                  <div className="widget-row">
                    <span className="n">Question Quality</span>
                    <span className="bar">
                      <span style={{ width: "60%" }}></span>
                    </span>
                  </div>
                  <div className="widget-row">
                    <span className="n">Biblical Accuracy</span>
                    <span className="bar">
                      <span style={{ width: "100%" }}></span>
                    </span>
                  </div>
                  <div className="widget-row">
                    <span className="n">Application</span>
                    <span className="bar">
                      <span
                        style={{
                          width: "40%",
                          background: "var(--amber)",
                        }}
                      ></span>
                    </span>
                  </div>
                </div>
              </article>

              <article className="who-card">
                <div className="who-icon" aria-hidden="true">
                  🤝
                </div>
                <h3>Small group leaders</h3>
                <p>
                  Lead a home group or LifeGroup? Learn the patterns that turn
                  surface-level discussions into conversations that change
                  lives, week after week.
                </p>
                <div className="who-widget">
                  <div className="widget-row">
                    <span className="n">Group Engagement</span>
                    <span className="bar">
                      <span style={{ width: "80%" }}></span>
                    </span>
                  </div>
                  <div className="widget-row">
                    <span className="n">Discussion Flow</span>
                    <span className="bar">
                      <span style={{ width: "70%" }}></span>
                    </span>
                  </div>
                  <div className="widget-row">
                    <span className="n">Prayer &amp; Tone</span>
                    <span className="bar">
                      <span style={{ width: "90%" }}></span>
                    </span>
                  </div>
                </div>
              </article>

              <article className="who-card">
                <div className="who-icon" aria-hidden="true">
                  ⛪
                </div>
                <h3>Church administrators</h3>
                <p>
                  Equip every leader in your church with a consistent coaching
                  framework. See growth measurably across your whole teaching
                  ministry.
                </p>
                <div className="who-widget">
                  <div className="widget-row">
                    <span className="n">Avg score Q1</span>
                    <span className="v">32 / 55</span>
                  </div>
                  <div className="widget-row">
                    <span className="n">Avg score Q2</span>
                    <span
                      className="v"
                      style={{ color: "var(--green-tx)" }}
                    >
                      38 / 55 ↑
                    </span>
                  </div>
                  <div className="widget-row">
                    <span className="n">Leaders coached</span>
                    <span className="v">24</span>
                  </div>
                </div>
              </article>
            </div>
          </div>
        </section>

        {/* BENEFITS */}
        <section className="benefits">
          <div className="wrap s-head-center">
            <span className="eyebrow">What you gain</span>
            <h2 className="s-title">
              Four ways coaching <em>changes how you lead.</em>
            </h2>
            <p className="s-lead">
              Not a grade. A playbook. Every coaching report shows exactly where
              you stood out, where you stalled, and what to try this Sunday.
            </p>
          </div>

          <div className="wrap">
            <div className="benefit-grid">
              <div className="benefit">
                <div className="benefit-num">01</div>
                <h4>Sharper teaching</h4>
                <p>
                  Get specific feedback on your questions, illustrations, and
                  applications. Know exactly what to try next week.
                </p>
              </div>
              <div className="benefit">
                <div className="benefit-num">02</div>
                <h4>Deeper groups</h4>
                <p>
                  Learn the patterns that turn surface-level discussions into
                  conversations that change lives.
                </p>
              </div>
              <div className="benefit">
                <div className="benefit-num">03</div>
                <h4>Stronger leaders</h4>
                <p>
                  Watch yourself grow across 11 dimensions of Bible leadership,
                  week by week, month by month.
                </p>
              </div>
              <div className="benefit">
                <div className="benefit-num">04</div>
                <h4>Measurable growth</h4>
                <p>
                  Clear scores, clear strengths, clear next steps. No mystery.
                  Just progress you can see.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* PRODUCT DETAIL */}
        <section className="product" id="product">
          <div className="wrap">
            <div className="s-head-center">
              <span className="eyebrow">Inside every report</span>
              <h2 className="s-title">
                Every report is a map for <em>next Sunday.</em>
              </h2>
              <p className="s-lead">
                Three parts. Every week. A scorecard that shows where you are,
                coaching on your craft, and three things to try next.
              </p>
            </div>

            {/* Feature 1: Scorecard */}
            <div className="feat-row">
              <div className="feat-copy">
                <span className="eyebrow">01 · Scorecard</span>
                <h3>11 dimensions. One clear score.</h3>
                <p>
                  Every session is scored across eleven structured dimensions
                  of Bible leadership. Color-coded ratings make strengths and
                  gaps jump out instantly.
                </p>
                <ul>
                  <li>
                    Every dimension rated STRONG, ON TARGET, or NEEDS WORK
                  </li>
                  <li>Trended over time so you see growth quarter by quarter</li>
                  <li>Consistent framework across every leader in your church</li>
                </ul>
              </div>
              <div className="feat-visual">
                <span className="feat-visual-label">SCORECARD</span>
                <div style={{ padding: "12px 0" }}>
                  <div className="dim-row" style={{ fontSize: "13px" }}>
                    <span className="dn">Lesson Preparation</span>
                    <span className="ds">5/5</span>
                    <span className="badge strong">STRONG</span>
                  </div>
                  <div className="dim-row" style={{ fontSize: "13px" }}>
                    <span className="dn">Biblical Accuracy</span>
                    <span className="ds">5/5</span>
                    <span className="badge strong">STRONG</span>
                  </div>
                  <div className="dim-row" style={{ fontSize: "13px" }}>
                    <span className="dn">Question Quality</span>
                    <span className="ds">3/5</span>
                    <span className="badge target">ON TARGET</span>
                  </div>
                  <div className="dim-row" style={{ fontSize: "13px" }}>
                    <span className="dn">Application</span>
                    <span className="ds">2/5</span>
                    <span className="badge needs">NEEDS WORK</span>
                  </div>
                  <div className="dim-row" style={{ fontSize: "13px" }}>
                    <span className="dn">Group Engagement</span>
                    <span className="ds">4/5</span>
                    <span className="badge target">ON TARGET</span>
                  </div>
                  <div className="dim-row" style={{ fontSize: "13px" }}>
                    <span className="dn">Prayer &amp; Tone</span>
                    <span className="ds">4/5</span>
                    <span className="badge target">ON TARGET</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Feature 2: Question coaching */}
            <div className="feat-row reverse">
              <div className="feat-copy">
                <span className="eyebrow">02 · Question coaching</span>
                <h3>Better questions. Every week.</h3>
                <p>
                  Bible teaching rises and falls on the quality of the
                  questions. We show you every question you asked, grade them,
                  and suggest sharper ones for next time.
                </p>
                <ul>
                  <li>Specific coaching on each question you actually asked</li>
                  <li>Suggested upgrades tied to your lesson&apos;s passage</li>
                  <li>Patterns across lessons so you build the craft over time</li>
                </ul>
              </div>
              <div className="feat-visual">
                <span className="feat-visual-label">QUESTION COACHING</span>
                <div style={{ padding: "16px 0" }}>
                  <div className="mini-question">
                    &ldquo;What does this passage teach about God&apos;s
                    character?&rdquo;
                    <span className="note">
                      Too broad. Try: &ldquo;How does v.11 reshape your picture
                      of God&apos;s care?&rdquo;
                    </span>
                  </div>
                  <div className="mini-question">
                    &ldquo;Any thoughts?&rdquo;
                    <span className="note">
                      Dead-end. Try naming a specific person or asking a closed
                      follow-up.
                    </span>
                  </div>
                  <div className="mini-question good">
                    &ldquo;Where in this week do you see the pattern Paul names
                    in v.5-6?&rdquo;
                    <span className="note">
                      ★ Strong. Anchors the text to real life.
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Feature 3: Recommendations */}
            <div className="feat-row">
              <div className="feat-copy">
                <span className="eyebrow">03 · Recommendations</span>
                <h3>Three actions. Not thirty.</h3>
                <p>
                  Every report ends with three concrete things to try next time,
                  ranked by impact, tied specifically to your session. No
                  generic advice. No overwhelm.
                </p>
                <ul>
                  <li>Three ranked actions tied to your specific lesson</li>
                  <li>Each one testable in a single session</li>
                  <li>Tracked next week so you can see if the change landed</li>
                </ul>
              </div>
              <div className="feat-visual">
                <span className="feat-visual-label">NEXT STEPS</span>
                <div style={{ padding: "16px 0" }}>
                  <div className="mini-rec">
                    <b>01 · Sharpen questions</b>Replace &ldquo;what do you
                    think?&rdquo; with a specific follow-up tied to the text.
                  </div>
                  <div className="mini-rec">
                    <b>02 · Close with application</b>End each session with one
                    specific action. Try: &ldquo;Text one person by
                    Wednesday.&rdquo;
                  </div>
                  <div className="mini-rec">
                    <b>03 · Hand off to the group</b>Try 3 minutes of silent
                    reading before your first question. Let them meet the text
                    first.
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* METHOD */}
        <section className="method" id="method">
          <div className="wrap">
            <div className="s-head-center">
              <span className="eyebrow">The method</span>
              <h2 className="s-title">
                Four phases. <em>One weekly loop.</em>
              </h2>
              <p className="s-lead">
                Record, analyze, coach, measure. Every Sunday becomes next
                Sunday&apos;s playbook. Simple enough to keep up with, thorough
                enough to actually grow.
              </p>
            </div>

            <div className="phases-grid">
              <div className="phase">
                <div className="phase-num">01</div>
                <div className="phase-name">Record</div>
                <p className="phase-desc">
                  Share an audio recording of your lesson, small group, or
                  teaching moment. No special equipment. A phone works.
                </p>
              </div>
              <div className="phase">
                <div className="phase-num">02</div>
                <div className="phase-name">Analyze</div>
                <p className="phase-desc">
                  A coach listens end-to-end and scores your session against the
                  11 dimensions of Bible leadership.
                </p>
              </div>
              <div className="phase">
                <div className="phase-num">03</div>
                <div className="phase-name">Coach</div>
                <p className="phase-desc">
                  You receive a written report with strengths, gaps, and three
                  concrete actions for your next session.
                </p>
              </div>
              <div className="phase">
                <div className="phase-num">04</div>
                <div className="phase-name">Measure</div>
                <p className="phase-desc">
                  Scores trend over time. You see growth. Pastors see readiness.
                  Admins see the investment pay off.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* DIMENSIONS TABLE */}
        <section className="dims" id="dimensions">
          <div className="wrap">
            <div className="s-head-center">
              <span className="eyebrow">The framework</span>
              <h2 className="s-title">
                <em>11 dimensions</em> of Bible leadership.
              </h2>
              <p className="s-lead">
                Every session scored against the same framework, every week.
                Here&apos;s the full list with a sample rating from one recent
                lesson.
              </p>
            </div>

            <div className="dims-table-wrap">
              <table className="dims-table">
                <thead>
                  <tr>
                    <th style={{ width: "28%" }}>Dimension</th>
                    <th>What it measures</th>
                    <th style={{ width: "90px", textAlign: "center" }}>
                      Sample
                    </th>
                    <th style={{ width: "140px", textAlign: "right" }}>
                      Rating
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="n">Lesson Preparation</td>
                    <td className="d">Structure, flow, time management</td>
                    <td className="s">5/5</td>
                    <td className="r">
                      <span className="badge strong">STRONG</span>
                    </td>
                  </tr>
                  <tr>
                    <td className="n">Biblical Accuracy</td>
                    <td className="d">Text handling, context, doctrine</td>
                    <td className="s">5/5</td>
                    <td className="r">
                      <span className="badge strong">STRONG</span>
                    </td>
                  </tr>
                  <tr>
                    <td className="n">Question Quality</td>
                    <td className="d">
                      Open-ended, thought-provoking, anchored
                    </td>
                    <td className="s">3/5</td>
                    <td className="r">
                      <span className="badge target">ON TARGET</span>
                    </td>
                  </tr>
                  <tr>
                    <td className="n">Group Engagement</td>
                    <td className="d">
                      Participation, listening, discussion flow
                    </td>
                    <td className="s">4/5</td>
                    <td className="r">
                      <span className="badge target">ON TARGET</span>
                    </td>
                  </tr>
                  <tr>
                    <td className="n">Application</td>
                    <td className="d">Life-change steps, real-world tie-ins</td>
                    <td className="s">2/5</td>
                    <td className="r">
                      <span className="badge needs">NEEDS WORK</span>
                    </td>
                  </tr>
                  <tr>
                    <td className="n">Prayer &amp; Tone</td>
                    <td className="d">Spiritual leadership, pastoral care</td>
                    <td className="s">4/5</td>
                    <td className="r">
                      <span className="badge target">ON TARGET</span>
                    </td>
                  </tr>
                  <tr>
                    <td className="n">Clarity</td>
                    <td className="d">
                      Communication, illustrations, pacing
                    </td>
                    <td className="s">4/5</td>
                    <td className="r">
                      <span className="badge target">ON TARGET</span>
                    </td>
                  </tr>
                  <tr>
                    <td className="n">Context &amp; Cross-References</td>
                    <td className="d">
                      Old/New Testament connections
                    </td>
                    <td className="s">3/5</td>
                    <td className="r">
                      <span className="badge target">ON TARGET</span>
                    </td>
                  </tr>
                  <tr>
                    <td className="n">Theological Depth</td>
                    <td className="d">
                      Doctrine taught accurately and accessibly
                    </td>
                    <td className="s">3/5</td>
                    <td className="r">
                      <span className="badge target">ON TARGET</span>
                    </td>
                  </tr>
                  <tr>
                    <td className="n">Response to Questions</td>
                    <td className="d">
                      Handling pushback, confusion, tangents
                    </td>
                    <td className="s">3/5</td>
                    <td className="r">
                      <span className="badge target">ON TARGET</span>
                    </td>
                  </tr>
                  <tr>
                    <td className="n">Closing &amp; Call to Action</td>
                    <td className="d">Summary, takeaway, commitment</td>
                    <td className="s">2/5</td>
                    <td className="r">
                      <span className="badge needs">NEEDS WORK</span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* REQUEST FORM */}
        <section className="request" id="request">
          <div className="wrap">
            <div className="request-card">
              <div style={{ textAlign: "center" }}>
                <span className="eyebrow">Get in touch</span>
                <h2>Request more information.</h2>
                <p className="lead">
                  Tell us about your role and your church. A VerseMate team
                  member will respond with a sample report and next steps
                  within 24 hours.
                </p>
              </div>
              <form id="request-form" onSubmit={handleSubmit}>
                <div className="form-grid">
                  <div className="form-field">
                    <label htmlFor="f-name">Name</label>
                    <input
                      type="text"
                      id="f-name"
                      name="Name"
                      required
                      autoComplete="name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                    />
                  </div>
                  <div className="form-field">
                    <label htmlFor="f-email">Email</label>
                    <input
                      type="email"
                      id="f-email"
                      name="Email"
                      required
                      autoComplete="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                  </div>
                  <div className="form-field">
                    <label htmlFor="f-role">Role</label>
                    <select
                      id="f-role"
                      name="Role"
                      value={role}
                      onChange={(e) => setRole(e.target.value as Role)}
                    >
                      <option>Bible study leader</option>
                      <option>Small group leader</option>
                      <option>Church administrator</option>
                      <option>Senior pastor</option>
                      <option>Other</option>
                    </select>
                  </div>
                  <div className="form-field">
                    <label htmlFor="f-church">Church size</label>
                    <select
                      id="f-church"
                      name="Church_size"
                      value={churchSize}
                      onChange={(e) =>
                        setChurchSize(e.target.value as ChurchSize)
                      }
                    >
                      <option>Under 100</option>
                      <option>100 – 500</option>
                      <option>500 – 2,000</option>
                      <option>2,000+</option>
                    </select>
                  </div>
                  <div className="form-field full">
                    <label htmlFor="f-notes">Notes (optional)</label>
                    <textarea
                      id="f-notes"
                      name="Notes"
                      placeholder="What would you like to know about Bible Leader Coaching?"
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                    ></textarea>
                  </div>
                </div>
                <div className="form-actions">
                  <button type="submit" className="btn btn-primary">
                    Request more information →
                  </button>
                  <a
                    href="mailto:info@versemate.org"
                    className="btn btn-ghost-dark"
                  >
                    Or email directly
                  </a>
                </div>
              </form>
            </div>
          </div>
        </section>

        {/* FINAL CTA */}
        <section className="final">
          <div className="wrap">
            <h2>
              Ready to grow
              <br />
              as a <em>leader?</em>
            </h2>
            <p>
              Send us a note. We&apos;ll send you a sample coaching report and
              walk you through exactly how it works for your church.
            </p>
            <a
              className="btn btn-primary"
              href="#request"
              style={{ padding: "20px 44px", fontSize: "16px" }}
            >
              Request more information →
            </a>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
