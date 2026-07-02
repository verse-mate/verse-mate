import Seo from "@/components/Seo";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import Link from "next/link";
import PageHero from "@/components/ui/PageHero";
import Section from "@/components/ui/Section";
import Reveal from "@/components/ui/Reveal";

export default function Privacy() {
  return (
    <div className="flex min-h-screen flex-col">
      <Seo
        title="Privacy Policy — VerseMate"
        description="How VerseMate collects, uses, and protects your information."
      />
      <Header />

      <main id="main-content" className="flex-1">
      {/* Hero Section */}
      <PageHero
        title="Privacy Policy"
        image="/give.png"
        align="center"
      >
        <p className="m-0 text-center font-inter text-body text-white/80">
          Effective Date: December 23, 2025 | Last Updated: December 23, 2025
        </p>
      </PageHero>

      {/* Content Section */}
      <Section className="bg-white" containerClassName="max-w-[820px]">
        <Reveal className="flex w-full flex-col gap-12">

          {/* Introduction */}
          <div>
            <p className="font-inter text-body text-brand-slate">
              VerseMate ("we," "our," or "us") is committed to protecting your privacy. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our mobile application and website (collectively, the "Service").
            </p>
            <p className="mt-4 font-inter text-body text-brand-slate">
              VerseMate is operated by VerseMate, a 501(c)(3) nonprofit organization. By using our Service, you agree to the collection and use of information in accordance with this policy.
            </p>
          </div>

          {/* Information We Collect */}
          <div>
            <h2 className="mb-6 inline-block border-b-4 border-brand-tan pb-2 font-merriweather text-2xl font-bold text-brand-black">
              Information We Collect
            </h2>

            <h3 className="mb-4 font-inter text-heading-3 text-brand-black">
              Information You Provide
            </h3>

            <p className="font-inter text-body font-semibold text-brand-black mb-2">
              Account Information
            </p>
            <ul className="list-disc pl-6 font-inter text-body text-brand-slate mb-4">
              <li>Email address (when you create an account)</li>
              <li>Display name (optional)</li>
              <li>Authentication credentials (securely hashed, never stored in plain text)</li>
            </ul>

            <p className="font-inter text-body font-semibold text-brand-black mb-2">
              User-Generated Content
            </p>
            <ul className="list-disc pl-6 font-inter text-body text-brand-slate mb-6">
              <li>Bookmarks you create</li>
              <li>Highlights you make in Scripture</li>
              <li>Personal notes and reflections</li>
              <li>Reading preferences and settings</li>
            </ul>

            <h3 className="mb-4 font-inter text-heading-3 text-brand-black">
              Information Collected Automatically
            </h3>

            <p className="font-inter text-body font-semibold text-brand-black mb-2">
              Usage Data
            </p>
            <ul className="list-disc pl-6 font-inter text-body text-brand-slate mb-4">
              <li>Pages and features you interact with</li>
              <li>Reading history and progress</li>
              <li>App performance data (load times, errors)</li>
              <li>Session duration and frequency</li>
            </ul>

            <p className="font-inter text-body font-semibold text-brand-black mb-2">
              Device Information
            </p>
            <ul className="list-disc pl-6 font-inter text-body text-brand-slate mb-4">
              <li>Device type and operating system</li>
              <li>App version</li>
              <li>Language and region settings</li>
              <li>Unique device identifiers (anonymized)</li>
            </ul>

            <p className="font-inter text-body font-semibold text-brand-black mb-2">
              Analytics Data
            </p>
            <p className="font-inter text-body text-brand-slate mb-2">
              We use PostHog, a privacy-focused analytics platform, to understand how our Service is used and to improve your experience. PostHog collects:
            </p>
            <ul className="list-disc pl-6 font-inter text-body text-brand-slate mb-2">
              <li>Feature usage patterns</li>
              <li>Navigation flows</li>
              <li>Error reports and crash data</li>
              <li>Performance metrics</li>
            </ul>
            <p className="font-inter text-body text-brand-slate">
              PostHog data is used solely for product improvement and is not sold to third parties.
            </p>
          </div>

          {/* How We Use Your Information */}
          <div>
            <h2 className="mb-6 inline-block border-b-4 border-brand-tan pb-2 font-merriweather text-2xl font-bold text-brand-black">
              How We Use Your Information
            </h2>

            <p className="font-inter text-body text-brand-slate mb-4">
              We use your information to:
            </p>
            <ul className="list-disc pl-6 font-inter text-body text-brand-slate mb-6">
              <li><strong>Provide the Service:</strong> Enable you to read Scripture, save bookmarks, create highlights and notes, and access your account across devices</li>
              <li><strong>Improve the Service:</strong> Analyze usage patterns to enhance features, fix bugs, and optimize performance</li>
              <li><strong>Personalize Your Experience:</strong> Remember your preferences, reading history, and saved content</li>
              <li><strong>Communicate With You:</strong> Send important updates about the Service (you can opt out of non-essential communications)</li>
              <li><strong>Ensure Security:</strong> Protect against unauthorized access, fraud, and abuse</li>
            </ul>

            <p className="font-inter text-body text-brand-slate mb-4">
              We do <strong>not</strong> use your information to:
            </p>
            <ul className="list-disc pl-6 font-inter text-body text-brand-slate">
              <li>Sell your data to third parties</li>
              <li>Display targeted advertisements</li>
              <li>Create advertising profiles</li>
              <li>Share your data with marketing partners</li>
            </ul>
          </div>

          {/* Data Sharing */}
          <div>
            <h2 className="mb-6 inline-block border-b-4 border-brand-tan pb-2 font-merriweather text-2xl font-bold text-brand-black">
              Data Sharing
            </h2>

            <p className="font-inter text-body text-brand-slate mb-4">
              We share your information only in the following limited circumstances:
            </p>

            <h3 className="mb-4 font-inter text-heading-3 text-brand-black">
              Service Providers
            </h3>

            <p className="font-inter text-body text-brand-slate mb-2">
              We work with trusted third-party services to operate VerseMate:
            </p>
            <ul className="list-disc pl-6 font-inter text-body text-brand-slate mb-4">
              <li><strong>Hosting & Infrastructure:</strong> Cloud servers to store your data securely</li>
              <li><strong>Analytics:</strong> PostHog for product analytics (privacy-focused, no data selling)</li>
              <li><strong>Authentication:</strong> Secure login services</li>
            </ul>
            <p className="font-inter text-body text-brand-slate mb-6">
              All service providers are contractually required to protect your data and use it only for the purposes we specify.
            </p>

            <h3 className="mb-4 font-inter text-heading-3 text-brand-black">
              Legal Requirements
            </h3>
            <p className="font-inter text-body text-brand-slate mb-6">
              We may disclose your information if required by law or in response to valid legal requests (e.g., court orders, subpoenas).
            </p>

            <h3 className="mb-4 font-inter text-heading-3 text-brand-black">
              With Your Consent
            </h3>
            <p className="font-inter text-body text-brand-slate">
              We may share your information in other circumstances if you give us explicit consent.
            </p>
          </div>

          {/* Data Retention */}
          <div>
            <h2 className="mb-6 inline-block border-b-4 border-brand-tan pb-2 font-merriweather text-2xl font-bold text-brand-black">
              Data Retention
            </h2>

            <p className="font-inter text-body text-brand-slate mb-4">
              We retain your information for as long as necessary to provide the Service:
            </p>

            <div className="overflow-x-auto mb-6">
              <table className="min-w-full border-collapse border border-brand-line">
                <thead>
                  <tr className="bg-brand-surface">
                    <th className="border border-brand-line px-4 py-2 text-left font-inter text-sm font-semibold text-brand-black md:text-base">Data Type</th>
                    <th className="border border-brand-line px-4 py-2 text-left font-inter text-sm font-semibold text-brand-black md:text-base">Retention Period</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="border border-brand-line px-4 py-2 font-inter text-sm text-brand-slate md:text-base">Account information</td>
                    <td className="border border-brand-line px-4 py-2 font-inter text-sm text-brand-slate md:text-base">Until you delete your account</td>
                  </tr>
                  <tr>
                    <td className="border border-brand-line px-4 py-2 font-inter text-sm text-brand-slate md:text-base">Bookmarks, highlights, notes</td>
                    <td className="border border-brand-line px-4 py-2 font-inter text-sm text-brand-slate md:text-base">Until you delete them or your account</td>
                  </tr>
                  <tr>
                    <td className="border border-brand-line px-4 py-2 font-inter text-sm text-brand-slate md:text-base">Reading history</td>
                    <td className="border border-brand-line px-4 py-2 font-inter text-sm text-brand-slate md:text-base">Until you delete your account</td>
                  </tr>
                  <tr>
                    <td className="border border-brand-line px-4 py-2 font-inter text-sm text-brand-slate md:text-base">Analytics data</td>
                    <td className="border border-brand-line px-4 py-2 font-inter text-sm text-brand-slate md:text-base">12 months, then anonymized</td>
                  </tr>
                  <tr>
                    <td className="border border-brand-line px-4 py-2 font-inter text-sm text-brand-slate md:text-base">Error/crash logs</td>
                    <td className="border border-brand-line px-4 py-2 font-inter text-sm text-brand-slate md:text-base">90 days</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <p className="font-inter text-body text-brand-slate">
              When you delete your account, we remove your personal data within 30 days, except where retention is required by law or for legitimate business purposes (e.g., fraud prevention).
            </p>
          </div>

          {/* Your Rights & Choices */}
          <div>
            <h2 className="mb-6 inline-block border-b-4 border-brand-tan pb-2 font-merriweather text-2xl font-bold text-brand-black">
              Your Rights & Choices
            </h2>

            <p className="font-inter text-body text-brand-slate mb-4">
              You have the following rights regarding your data:
            </p>

            <h3 className="mb-4 font-inter text-heading-3 text-brand-black">
              Access & Portability
            </h3>
            <p className="font-inter text-body text-brand-slate mb-6">
              You can view your personal data within the app settings. Contact us at <a href="mailto:info@versemate.org" className="text-brand-tan">info@versemate.org</a> to request a copy of your data.
            </p>

            <h3 className="mb-4 font-inter text-heading-3 text-brand-black">
              Correction
            </h3>
            <p className="font-inter text-body text-brand-slate mb-6">
              You can update your account information and preferences at any time within the app.
            </p>

            <h3 className="mb-4 font-inter text-heading-3 text-brand-black">
              Deletion
            </h3>
            <p className="font-inter text-body text-brand-slate mb-6">
              You can delete individual bookmarks, highlights, and notes at any time. To delete your entire account and all associated data, contact us at <a href="mailto:info@versemate.org" className="text-brand-tan">info@versemate.org</a>.
            </p>

            <h3 className="mb-4 font-inter text-heading-3 text-brand-black">
              Opt-Out of Analytics
            </h3>
            <p className="font-inter text-body text-brand-slate mb-6">
              You can opt out of analytics tracking in the app settings. This will stop the collection of usage data while still allowing the app to function.
            </p>

            <h3 className="mb-4 font-inter text-heading-3 text-brand-black">
              Do Not Sell My Personal Information
            </h3>
            <p className="font-inter text-body text-brand-slate mb-6">
              We do not sell your personal information. Ever.
            </p>

            <h3 className="mb-4 font-inter text-heading-3 text-brand-black">
              For California Residents (CCPA)
            </h3>
            <p className="font-inter text-body text-brand-slate mb-6">
              California residents have additional rights under the California Consumer Privacy Act, including the right to know what personal information is collected, request deletion, and opt out of sale (though we do not sell data).
            </p>

            <h3 className="mb-4 font-inter text-heading-3 text-brand-black">
              For European Users (GDPR)
            </h3>
            <p className="font-inter text-body text-brand-slate">
              If you are in the European Economic Area, you have rights under the General Data Protection Regulation, including access, rectification, erasure, restriction, portability, and objection. Contact us at <a href="mailto:info@versemate.org" className="text-brand-tan">info@versemate.org</a> to exercise these rights.
            </p>
          </div>

          {/* Data Security */}
          <div>
            <h2 className="mb-6 inline-block border-b-4 border-brand-tan pb-2 font-merriweather text-2xl font-bold text-brand-black">
              Data Security
            </h2>

            <p className="font-inter text-body text-brand-slate mb-4">
              We implement industry-standard security measures to protect your data:
            </p>
            <ul className="list-disc pl-6 font-inter text-body text-brand-slate mb-4">
              <li><strong>Encryption:</strong> Data is encrypted in transit (TLS/HTTPS) and at rest</li>
              <li><strong>Secure Authentication:</strong> Passwords are hashed using modern algorithms</li>
              <li><strong>Access Controls:</strong> Only authorized personnel can access user data</li>
              <li><strong>Regular Audits:</strong> We regularly review our security practices</li>
            </ul>
            <p className="font-inter text-body text-brand-slate">
              While we strive to protect your information, no method of transmission or storage is 100% secure. If you discover a security vulnerability, please contact us at <a href="mailto:info@versemate.org" className="text-brand-tan">info@versemate.org</a>.
            </p>
          </div>

          {/* Children's Privacy */}
          <div>
            <h2 className="mb-6 inline-block border-b-4 border-brand-tan pb-2 font-merriweather text-2xl font-bold text-brand-black">
              Children's Privacy
            </h2>

            <p className="font-inter text-body text-brand-slate">
              VerseMate is intended for users aged 13 and older. We do not knowingly collect personal information from children under 13. If you believe a child under 13 has provided us with personal information, please contact us at <a href="mailto:info@versemate.org" className="text-brand-tan">info@versemate.org</a>, and we will delete such information.
            </p>
          </div>

          {/* Third-Party Links */}
          <div>
            <h2 className="mb-6 inline-block border-b-4 border-brand-tan pb-2 font-merriweather text-2xl font-bold text-brand-black">
              Third-Party Links
            </h2>

            <p className="font-inter text-body text-brand-slate">
              The Service may contain links to third-party websites or services. We are not responsible for the privacy practices of these third parties. We encourage you to review their privacy policies before providing any personal information.
            </p>
          </div>

          {/* Changes to This Policy */}
          <div>
            <h2 className="mb-6 inline-block border-b-4 border-brand-tan pb-2 font-merriweather text-2xl font-bold text-brand-black">
              Changes to This Policy
            </h2>

            <p className="font-inter text-body text-brand-slate mb-4">
              We may update this Privacy Policy from time to time. We will notify you of any material changes by:
            </p>
            <ul className="list-disc pl-6 font-inter text-body text-brand-slate mb-4">
              <li>Posting the updated policy within the app</li>
              <li>Updating the "Last Updated" date at the top of this page</li>
              <li>Sending an email notification for significant changes (if you have an account)</li>
            </ul>
            <p className="font-inter text-body text-brand-slate">
              Your continued use of the Service after changes become effective constitutes acceptance of the updated policy.
            </p>
          </div>

          {/* Contact Us */}
          <div>
            <h2 className="mb-6 inline-block border-b-4 border-brand-tan pb-2 font-merriweather text-2xl font-bold text-brand-black">
              Contact Us
            </h2>

            <p className="font-inter text-body text-brand-slate mb-4">
              If you have questions about this Privacy Policy or our data practices, please contact us:
            </p>
            <p className="font-inter text-body text-brand-slate mb-2">
              <strong>Email:</strong>{" "}
              <a href="mailto:info@versemate.org" className="text-brand-tan">info@versemate.org</a>
            </p>
            <p className="font-inter text-body text-brand-slate">
              <strong>Support:</strong>{" "}
              <Link href="/support" className="text-brand-tan">https://versemate.org/support</Link>
            </p>
          </div>

          {/* About VerseMate */}
          <div>
            <h2 className="mb-6 inline-block border-b-4 border-brand-tan pb-2 font-merriweather text-2xl font-bold text-brand-black">
              About VerseMate
            </h2>

            <p className="font-inter text-body text-brand-slate mb-4">
              VerseMate is a 501(c)(3) nonprofit organization dedicated to making the Bible easier to understand for everyone, everywhere.
            </p>
            <p className="italic font-inter text-body text-brand-slate">
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
