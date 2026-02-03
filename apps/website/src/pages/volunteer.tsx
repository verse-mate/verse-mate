import React, { useState } from "react";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";

export default function Volunteer() {
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

I'm interested in volunteering with VerseMate! Here are my details:

First Name: ${formData.firstName}
Last Name: ${formData.lastName}
Email: ${formData.email}

Additional Information:
${formData.message || 'No additional information provided.'}

Thank you for considering my application to volunteer!

Best regards,
${formData.firstName} ${formData.lastName}`;

    const subject = encodeURIComponent('Volunteer Application - ' + formData.firstName + ' ' + formData.lastName);
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
          backgroundImage: "linear-gradient(90deg, rgba(0, 0, 0, 0.7) 0%, rgba(0, 0, 0, 0.3) 100%), url('/ServeWithVersemate.png')",
        }}
      >
        <div className="mx-auto flex max-w-[1440px] flex-col gap-8 md:gap-12 lg:gap-16">
          {/* Title */}
          <h1 className="font-inter text-2xl font-bold uppercase leading-8 tracking-[0.1em] text-white inline-block py-2 border-b-[6px] border-brand-tan w-fit">
            SERVE WITH VERSEMATE
          </h1>

          {/* Content */}
          <div className="flex flex-col gap-4 max-w-full lg:max-w-[1200px]">
            <h2 className="font-merriweather text-3xl font-bold leading-tight text-white md:text-4xl md:leading-tight lg:text-5xl lg:leading-[64px]">
              Versemate exists to help people everywhere truly understand God's Word - not just read it.
            </h2>

            <div className="flex flex-col gap-4 font-inter text-base font-light leading-6 text-white md:text-lg md:leading-7 lg:text-xl lg:leading-8 xl:text-2xl xl:leading-8">
              <p>
                Every day, volunteers play a vital role in making this mission possible.
              </p>
              <p>
                God created you with unique gifts, passions, and talents. When you serve with Versemate, you'll use them to help others encounter Scripture clearly and grow deeper in faith.
              </p>
              <p>
                Whether you love languages, prayer, or problem-solving, there's a place for you here. And don't worry - we'll provide training and support so you can serve with confidence.
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
              Join the VerseMate Volunteer Team
            </h2>
            <p className="text-center font-inter text-sm font-light leading-6 text-black md:text-base md:leading-6">
              We'd love to hear from you! If you're interested in getting involved with VerseMate, please fill out the form below. Tell us a bit about yourself, your skills, and what excites you about getting involved. Our team will connect with you soon to help you find the best fit.
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
