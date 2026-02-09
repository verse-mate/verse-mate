import React from "react";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import Link from "next/link";

export default function Support() {
  return (
    <div className="flex min-h-screen flex-col">
      <Header />

      {/* Hero Section */}
      <section
        className="w-full min-h-[300px] bg-cover bg-center px-6 pt-24 pb-12 md:px-12 md:py-16 lg:px-16 lg:py-20 xl:px-[120px] xl:py-24"
        style={{
          backgroundImage: "linear-gradient(90deg, rgba(0, 0, 0, 0.7) 0%, rgba(0, 0, 0, 0.3) 100%), url('/give.png')",
        }}
      >
        <div className="flex flex-col items-center gap-8">
          <h1 className="font-inter text-2xl font-bold uppercase leading-8 tracking-[0.1em] text-white text-center inline-block py-2 border-b-[6px] border-brand-tan w-fit mx-auto">
            CONTACT SUPPORT
          </h1>
          <p className="max-w-[600px] text-center font-inter text-sm font-light leading-6 text-white md:text-base md:leading-6">
            We're here to help! If you have any questions, feedback, or need assistance with VerseMate, please don't hesitate to reach out.
          </p>
        </div>
      </section>

      {/* Content Section */}
      <section className="w-full bg-white px-6 py-12 md:px-12 md:py-16 lg:px-16 lg:py-20 xl:px-[120px] xl:py-24">
        <div className="mx-auto flex w-full max-w-[800px] flex-col items-center gap-12">

          {/* Contact Section */}
          <div className="flex w-full flex-col items-center gap-8">
            <div className="text-center">
              <h2 className="font-inter text-xl font-bold leading-8 text-black md:text-2xl md:leading-8 inline-block border-b-[6px] border-brand-tan pb-2 w-fit mx-auto mb-6">
                Get in Touch
              </h2>
              <p className="mx-auto max-w-[600px] font-inter text-sm font-light leading-6 text-black md:text-base md:leading-6">
                Whether you're experiencing technical issues, have questions about the app, or simply want to share feedback, our team is happy to assist you.
              </p>
            </div>

            {/* Email Contact Card */}
            <div className="flex w-full max-w-[500px] flex-col items-center gap-6 rounded-lg bg-[#F9F9F9] px-12 py-12">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-brand-tan">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M4 4H20C21.1 4 22 4.9 22 6V18C22 19.1 21.1 20 20 20H4C2.9 20 2 19.1 2 18V6C2 4.9 2.9 4 4 4Z" stroke="#000000" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M22 6L12 13L2 6" stroke="#000000" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <div className="text-center">
                <h3 className="font-inter text-base font-semibold leading-7 text-black md:text-lg md:leading-7 mb-2">
                  Email Us
                </h3>
                <p className="font-inter text-sm font-light leading-6 text-[#666666] md:text-base md:leading-6 mb-6">
                  Send us an email and we'll get back to you as soon as possible.
                </p>
                <a
                  href="mailto:info@versemate.org"
                  className="inline-flex items-center justify-center gap-2 rounded-full bg-brand-tan px-8 py-4 font-inter text-base font-semibold leading-6 text-black no-underline md:text-base md:leading-6 hover:bg-opacity-90 transition-opacity"
                >
                  info@versemate.org
                </a>
              </div>
            </div>
          </div>

          {/* Additional Info Section */}
          <div className="flex w-full flex-col items-center gap-6 text-center">
            <h2 className="font-inter text-xl font-bold leading-8 text-black md:text-2xl md:leading-8 inline-block border-b-[6px] border-brand-tan pb-2 w-fit mx-auto mb-0">
              What to Include in Your Message
            </h2>
            <div className="flex max-w-[600px] flex-col gap-4 text-left">
              <p className="font-inter text-sm font-light leading-6 text-black md:text-base md:leading-6">
                To help us assist you better, please include:
              </p>
              <ul className="list-disc pl-6 font-inter text-sm font-light leading-6 text-black md:text-base md:leading-6">
                <li>A description of the issue or question</li>
                <li>The device you're using (iPhone, Android, etc.)</li>
                <li>The app version (found in Settings)</li>
                <li>Any error messages you've seen</li>
                <li>Steps to reproduce the issue (if applicable)</li>
              </ul>
            </div>
          </div>

          {/* Privacy Link */}
          <div className="flex w-full flex-col items-center gap-4 border-t border-[#E0E0E0] pt-8 text-center">
            <p className="font-inter text-xs font-light leading-5 text-[#666666] md:text-sm md:leading-5">
              For information about how we handle your data, please see our{" "}
              <Link href="/privacy" className="text-brand-tan">
                Privacy Policy
              </Link>
              .
            </p>
          </div>

          {/* About VerseMate */}
          <div className="flex flex-col items-center gap-4 text-center">
            <p className="font-inter text-xs font-light leading-5 text-[#666666] md:text-sm md:leading-5">
              VerseMate is a 501(c)(3) nonprofit organization dedicated to making the Bible easier to understand for everyone, everywhere.
            </p>
            <p className="italic font-inter text-xs font-light leading-5 text-[#666666] md:text-sm md:leading-5">
              "The Bible Was Meant to Be Understood - Not Just Read."
            </p>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
