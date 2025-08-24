"use client";

import Footer from "@/sections/desktop/Footer";
import Header from "@/sections/desktop/Header";
import Link from "next/link";

export default function Give() {
  return (
    <div className="min-h-screen">
      <Header />

      <main className="py-20 px-6">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-16">
            <h1 className="text-5xl font-bold mb-8">Give</h1>
            <h2 className="text-3xl font-bold text-gray-800 mb-6">
              Believe in the Mission?
            </h2>
            <p className="text-xl text-gray-600">Make a Donation</p>
          </div>

          <div className="bg-orange-600 rounded-lg p-12 mb-12">
            <div className="h-64 flex items-center justify-center">
              <span className="text-white text-2xl">Bible/Give Image</span>
            </div>
          </div>

          <div className="text-center space-y-8">
            <div className="space-y-4 text-lg text-gray-700">
              <p>
                Your support helps us keep Versemate free for everyone, forever.
              </p>
              <p>
                As a 501(c)(3) nonprofit, every donation goes directly toward
                making the Bible more accessible to people around the world.
              </p>
            </div>

            <div className="space-y-4">
              <h3 className="text-2xl font-bold">Your donation supports:</h3>
              <ul className="text-left max-w-2xl mx-auto space-y-2 text-gray-700">
                <li>• Free access to biblical resources for all users</li>
                <li>• Translation work into multiple languages</li>
                <li>• Technology development and server costs</li>
                <li>• Content creation and scholarly review</li>
                <li>• Outreach to underserved communities worldwide</li>
              </ul>
            </div>

            <div className="bg-gray-100 p-8 rounded-lg">
              <p className="text-sm text-gray-600 mb-4">
                Versemate is a 501(c)(3) nonprofit organization. All donations
                are tax-deductible to the full extent allowed by law.
              </p>
              <p className="text-xs text-gray-500">
                Tax ID: [To be filled with actual EIN]
              </p>
            </div>

            <div className="pt-8">
              <Link
                href="#"
                className="bg-yellow-600 hover:bg-yellow-700 text-white px-12 py-4 rounded-lg font-semibold text-lg transition-colors inline-block"
              >
                Make a Donation
              </Link>
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
