import React, { useState } from "react";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";

export default function Give() {
  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    email: "",
    message: ""
  });

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const emailBody = `Hi VerseMate Team,

I'm interested in making a donation to support VerseMate! Here are my details:

First Name: ${formData.firstName}
Last Name: ${formData.lastName}
Email: ${formData.email}

Additional Information:
${formData.message || 'No additional information provided.'}

Thank you for the opportunity to support your mission!

Best regards,
${formData.firstName} ${formData.lastName}`;

    const subject = encodeURIComponent('Donation Inquiry - ' + formData.firstName + ' ' + formData.lastName);
    const body = encodeURIComponent(emailBody);
    const mailtoUrl = `mailto:info@versemate.org?subject=${subject}&body=${body}`;
    window.location.href = mailtoUrl;
  };

  return (
    <div className="flex min-h-screen flex-col">
      <Header />

      {/* Hero Section */}
      <section
        className="w-full bg-cover bg-center px-6 pt-24 pb-12 md:px-12 md:py-16 lg:px-16 lg:py-20 xl:px-[120px] xl:py-24"
        style={{
          backgroundImage: "linear-gradient(90deg, rgba(0, 0, 0, 0.7) 0%, rgba(0, 0, 0, 0.3) 100%), url('/give.png')",
        }}
      >
        <div className="mx-auto flex max-w-[1440px] flex-col gap-8 md:gap-12 lg:gap-16">
          {/* Title */}
          <h1 className="font-inter text-2xl font-bold uppercase leading-8 tracking-[0.1em] text-white inline-block py-2 border-b-[6px] border-brand-tan w-fit">
            SUPPORT VERSEMATE
          </h1>

          {/* Content */}
          <div className="flex flex-col gap-4 max-w-full lg:max-w-[1200px]">
            <h2 className="font-merriweather text-3xl font-bold leading-tight text-white md:text-4xl md:leading-tight lg:text-5xl lg:leading-[64px]">
              Help People Everywhere Engage with God's Word
            </h2>

            <div className="flex flex-col gap-4 font-inter text-base font-light leading-6 text-white md:text-lg md:leading-7 lg:text-xl lg:leading-8 xl:text-2xl xl:leading-8">
              <p>
                Your generosity helps us create resources and tools that make Scripture clear and accessible to people worldwide. Every gift you give makes a direct impact—whether it's supporting the translation of content, improving our technology, or helping us reach new communities with the truth of God's Word.
              </p>
              <p>
                Through your partnership, VerseMate can continue developing simple, powerful tools that guide people not only to read the Bible, but to truly understand and apply it in their daily lives. We believe that when people engage Scripture with clarity, transformation follows—families are encouraged, faith grows stronger, and entire communities can be renewed.
              </p>
              <p>
                Thank you for prayerfully considering a gift to VerseMate. Together, we can equip more people across languages and cultures to connect with God's Word in a deeper way.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Form Section */}
      <section className="w-full bg-white px-6 py-12 md:px-12 md:py-16 lg:px-16 lg:py-20 xl:px-[120px] xl:py-24">
        <div className="mx-auto flex max-w-[600px] flex-col items-center gap-10">
          {/* Form Header */}
          <div className="flex w-full flex-col items-center gap-4">
            <h2 className="font-inter text-xl font-bold leading-8 text-black md:text-2xl md:leading-8">
              Connect With Us About Donations
            </h2>
            <p className="text-center font-inter text-sm font-light leading-6 text-black md:text-base md:leading-6">
              We'd love to hear from you! If you're interested in supporting VerseMate with a donation, please fill out the form below. One of our team members will connect with you soon to guide you through the next steps.
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="flex w-full flex-col gap-6">
            {/* First Name */}
            <div className="flex flex-col gap-1">
              <label className="flex items-center gap-1">
                <span className="font-inter text-sm font-normal leading-4 text-[#818991]">First Name</span>
                <span className="font-inter text-sm font-normal leading-4 text-[#B03A42]">*</span>
              </label>
              <input
                type="text"
                name="firstName"
                value={formData.firstName}
                onChange={handleInputChange}
                required
                className="w-full rounded-[5px] border border-[#DCE0E3] bg-white px-4 py-4 font-inter text-base font-normal leading-6 text-black"
              />
            </div>

            {/* Last Name */}
            <div className="flex flex-col gap-1">
              <label className="flex items-center gap-1">
                <span className="font-inter text-sm font-normal leading-4 text-[#818991]">Last Name</span>
                <span className="font-inter text-sm font-normal leading-4 text-[#B03A42]">*</span>
              </label>
              <input
                type="text"
                name="lastName"
                value={formData.lastName}
                onChange={handleInputChange}
                required
                className="w-full rounded-[5px] border border-[#DCE0E3] bg-white px-4 py-4 font-inter text-base font-normal leading-6 text-black"
              />
            </div>

            {/* Email */}
            <div className="flex flex-col gap-1">
              <label className="flex items-center gap-1">
                <span className="font-inter text-sm font-normal leading-4 text-[#818991]">Email</span>
                <span className="font-inter text-sm font-normal leading-4 text-[#B03A42]">*</span>
              </label>
              <input
                type="email"
                name="email"
                value={formData.email}
                onChange={handleInputChange}
                required
                className="w-full rounded-[5px] border border-[#DCE0E3] bg-white px-4 py-4 font-inter text-base font-normal leading-6 text-black"
              />
            </div>

            {/* Message */}
            <div className="flex flex-col gap-1">
              <label>
                <span className="font-inter text-sm font-normal leading-4 text-[#818991]">Anything You'd Like Us to Know</span>
              </label>
              <textarea
                name="message"
                value={formData.message}
                onChange={handleInputChange}
                rows={5}
                className="w-full resize-none rounded-[5px] border border-[#DCE0E3] bg-white px-4 py-4 font-inter text-base font-normal leading-6 text-black"
              />
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              className="mx-auto flex items-center justify-center gap-2 rounded-full bg-brand-tan px-12 py-6 font-inter text-lg font-semibold leading-8 text-black md:text-xl md:leading-8 hover:bg-opacity-90 transition-opacity"
            >
              Submit
            </button>
          </form>
        </div>
      </section>

      <Footer />
    </div>
  );
}
