import { Mail } from "lucide-react";
import Seo from "@/components/Seo";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import Link from "next/link";
import PageHero from "@/components/ui/PageHero";
import Section from "@/components/ui/Section";
import { buttonClass } from "@/components/ui/Button";
import Reveal from "@/components/ui/Reveal";

export default function Support() {
  return (
    <div className="flex min-h-screen flex-col">
      <Seo
        title="Support — VerseMate"
        description="Contact VerseMate support with questions, feedback, or help using the app. We're here to help."
      />
      <Header />

      <main id="main-content" className="flex-1">
      {/* Hero Section */}
      <PageHero
        eyebrow="Contact Support"
        title="We're here to help!"
        image="/give.png"
        align="center"
      >
        <p className="m-0 text-center">
          If you have any questions, feedback, or need assistance with
          VerseMate, please don't hesitate to reach out.
        </p>
      </PageHero>

      {/* Content Section */}
      <Section className="bg-white" containerClassName="max-w-[800px]">
        <Reveal className="flex w-full flex-col items-center gap-12">

          {/* Contact Section */}
          <div className="flex w-full flex-col items-center gap-8">
            <div className="text-center">
              <h2 className="mx-auto inline-block border-b-4 border-brand-tan pb-2 font-merriweather text-2xl font-bold text-brand-black mb-6">
                Get in Touch
              </h2>
              <p className="mx-auto max-w-[600px] font-inter text-sm font-normal leading-6 text-black md:text-base md:leading-6">
                Whether you're experiencing technical issues, have questions about the app, or simply want to share feedback, our team is happy to assist you.
              </p>
            </div>

            {/* Email Contact Card */}
            <div className="flex w-full max-w-[500px] flex-col items-center gap-6 rounded-card bg-brand-surface px-12 py-12">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-brand-tan">
                <Mail className="h-8 w-8 text-brand-black" strokeWidth={2} />
              </div>
              <div className="text-center">
                <h3 className="font-inter text-base font-semibold leading-7 text-black md:text-lg md:leading-7 mb-2">
                  Email Us
                </h3>
                <p className="font-inter text-sm font-normal leading-6 text-brand-muted md:text-base md:leading-6 mb-6">
                  Send us an email and we'll get back to you as soon as possible.
                </p>
                <a href="mailto:info@versemate.org" className={buttonClass()}>
                  info@versemate.org
                </a>
              </div>
            </div>
          </div>

          {/* Additional Info Section */}
          <div className="flex w-full flex-col items-center gap-6 text-center">
            <h2 className="mx-auto inline-block border-b-4 border-brand-tan pb-2 font-merriweather text-2xl font-bold text-brand-black mb-0">
              What to Include in Your Message
            </h2>
            <div className="flex max-w-[600px] flex-col gap-4 text-left">
              <p className="font-inter text-sm font-normal leading-6 text-black md:text-base md:leading-6">
                To help us assist you better, please include:
              </p>
              <ul className="list-disc pl-6 font-inter text-sm font-normal leading-6 text-black md:text-base md:leading-6">
                <li>A description of the issue or question</li>
                <li>The device you're using (iPhone, Android, etc.)</li>
                <li>The app version (found in Settings)</li>
                <li>Any error messages you've seen</li>
                <li>Steps to reproduce the issue (if applicable)</li>
              </ul>
            </div>
          </div>

          {/* Privacy Link */}
          <div className="flex w-full flex-col items-center gap-4 border-t border-brand-line pt-8 text-center">
            <p className="font-inter text-xs font-normal leading-5 text-brand-muted md:text-sm md:leading-5">
              For information about how we handle your data, please see our{" "}
              <Link href="/privacy" className="text-brand-tan">
                Privacy Policy
              </Link>
              .
            </p>
          </div>

          {/* About VerseMate */}
          <div className="flex flex-col items-center gap-4 text-center">
            <p className="font-inter text-xs font-normal leading-5 text-brand-muted md:text-sm md:leading-5">
              VerseMate is a 501(c)(3) nonprofit organization dedicated to making the Bible easier to understand for everyone, everywhere.
            </p>
            <p className="italic font-inter text-xs font-normal leading-5 text-brand-muted md:text-sm md:leading-5">
              "The Bible Was Meant to Be Understood - Not Just Read."
            </p>
          </div>
        </Reveal>
      </Section>
      </main>

      <Footer />
    </div>
  );
}
