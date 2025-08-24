"use client";

import Footer from "@/sections/desktop/Footer";
import Header from "@/sections/desktop/Header";

export default function About() {
  return (
    <div className="min-h-screen">
      <Header />

      <main className="py-20 px-6">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-5xl font-bold mb-8 text-center">ABOUT</h1>
          <div className="w-24 h-1 bg-yellow-600 mx-auto mb-16" />

          <div className="space-y-12 text-lg text-gray-700">
            <section>
              <h2 className="text-4xl font-bold mb-8">ABOUT</h2>
              <div className="w-16 h-1 bg-yellow-600 mb-8" />

              <div className="space-y-6">
                <p>
                  Versemate is a nonprofit organization on a mission to make the
                  Bible easier to understand, study, and love - for everyone,
                  everywhere.
                </p>
                <p>
                  We are developers, translators, and believers from around the
                  world, united by one calling: to help more people connect with
                  God through His Word.
                </p>
                <p>
                  To make the Word of God easy to understand, deeply accessible,
                  and free to everyone - so more people around the world can
                  encounter Scripture, grow in faith, and walk closer with
                  Christ.
                </p>
              </div>
            </section>

            <div className="w-16 h-1 bg-yellow-600" />

            <section>
              <h2 className="text-4xl font-bold mb-8">
                Built by Believers.
                <br />
                Guided by the Word.
              </h2>
              <div className="w-16 h-1 bg-yellow-600 mb-8" />

              <div className="space-y-6">
                <p>
                  Versemate is a nonprofit organization on a mission to make the
                  Bible easier to understand, study, and love - for everyone,
                  everywhere.
                </p>
                <p>
                  We are developers, translators, and believers from around the
                  world, united by one calling: to help more people connect with
                  God through His Word.
                </p>
                <p>
                  To make the Word of God easy to understand, deeply accessible,
                  and free to everyone - so more people around the world can
                  encounter Scripture, grow in faith, and walk closer with
                  Christ.
                </p>
              </div>
            </section>

            <div className="w-16 h-1 bg-yellow-600" />

            <section>
              <h2 className="text-4xl font-bold mb-8">
                Illuminating God's Word for Everyone
              </h2>

              <div className="space-y-6">
                <p>
                  We believe the Bible isn't just for scholars or clergy - it's
                  for everyone. Whether you're discovering Scripture for the
                  first time or leading a study group, Versemate helps
                  illuminate God's Word for real understanding and lasting
                  transformation.
                </p>
              </div>
            </section>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
