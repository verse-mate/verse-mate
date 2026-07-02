import React, { useState } from "react";
import Seo from "@/components/Seo";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import PageHero from "@/components/ui/PageHero";
import Section from "@/components/ui/Section";
import Button from "@/components/ui/Button";
import Reveal from "@/components/ui/Reveal";

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
      <Seo
        title="Volunteer — VerseMate"
        description="Serve with VerseMate and help people everywhere truly understand God's Word. Developers, testers, translators, and people of faith welcome."
      />
      <Header />

      <main id="main-content" className="flex-1">
      {/* Hero Section */}
      <PageHero
        eyebrow="Serve with VerseMate"
        title="Versemate exists to help people everywhere truly understand God's Word - not just read it."
        image="/ServeWithVersemate.png"
      >
        <p className="m-0">
          Every day, volunteers play a vital role in making this mission
          possible.
        </p>
        <p className="m-0">
          God created you with unique gifts, passions, and talents. When you
          serve with Versemate, you'll use them to help others encounter
          Scripture clearly and grow deeper in faith.
        </p>
        <p className="m-0">
          Whether you love languages, prayer, or problem-solving, there's a
          place for you here. And don't worry - we'll provide training and
          support so you can serve with confidence.
        </p>
      </PageHero>

      {/* Form Section */}
      <Section className="bg-white" containerClassName="max-w-[600px]">
        <Reveal className="flex w-full flex-col items-center gap-10">
          {/* Form Header */}
          <div className="flex w-full flex-col items-center gap-4">
            <h2 className="m-0 text-center font-merriweather text-section-title text-brand-black">
              Join the VerseMate Volunteer Team
            </h2>
            <p className="text-center font-inter text-body text-brand-slate">
              We'd love to hear from you! If you're interested in getting involved with VerseMate, please fill out the form below. Tell us a bit about yourself, your skills, and what excites you about getting involved. Our team will connect with you soon to help you find the best fit.
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="flex w-full flex-col gap-6">
            {/* First Name */}
            <div className="flex flex-col gap-1">
              <label htmlFor="vol-firstName" className="flex items-center gap-1">
                <span className="font-inter text-sm font-normal leading-4 text-brand-muted">First Name</span>
                <span className="font-inter text-sm font-normal leading-4 text-brand-danger">*</span>
              </label>
              <input
                id="vol-firstName"
                type="text"
                name="firstName"
                autoComplete="given-name"
                value={formData.firstName}
                onChange={handleInputChange}
                required
                className="w-full rounded-input border border-brand-line bg-white px-4 py-4 font-inter text-base font-normal leading-6 text-black"
              />
            </div>

            {/* Last Name */}
            <div className="flex flex-col gap-1">
              <label htmlFor="vol-lastName" className="flex items-center gap-1">
                <span className="font-inter text-sm font-normal leading-4 text-brand-muted">Last Name</span>
                <span className="font-inter text-sm font-normal leading-4 text-brand-danger">*</span>
              </label>
              <input
                id="vol-lastName"
                type="text"
                name="lastName"
                autoComplete="family-name"
                value={formData.lastName}
                onChange={handleInputChange}
                required
                className="w-full rounded-input border border-brand-line bg-white px-4 py-4 font-inter text-base font-normal leading-6 text-black"
              />
            </div>

            {/* Email */}
            <div className="flex flex-col gap-1">
              <label htmlFor="vol-email" className="flex items-center gap-1">
                <span className="font-inter text-sm font-normal leading-4 text-brand-muted">Email</span>
                <span className="font-inter text-sm font-normal leading-4 text-brand-danger">*</span>
              </label>
              <input
                id="vol-email"
                type="email"
                name="email"
                autoComplete="email"
                value={formData.email}
                onChange={handleInputChange}
                required
                className="w-full rounded-input border border-brand-line bg-white px-4 py-4 font-inter text-base font-normal leading-6 text-black"
              />
            </div>

            {/* Message */}
            <div className="flex flex-col gap-1">
              <label htmlFor="vol-message">
                <span className="font-inter text-sm font-normal leading-4 text-brand-muted">Anything You'd Like Us to Know</span>
              </label>
              <textarea
                id="vol-message"
                name="message"
                value={formData.message}
                onChange={handleInputChange}
                rows={5}
                className="w-full resize-none rounded-input border border-brand-line bg-white px-4 py-4 font-inter text-base font-normal leading-6 text-black"
              />
            </div>

            {/* Submit Button */}
            <Button type="submit" className="mx-auto">
              Submit
            </Button>
          </form>
        </Reveal>
      </Section>
      </main>

      <Footer />
    </div>
  );
}
