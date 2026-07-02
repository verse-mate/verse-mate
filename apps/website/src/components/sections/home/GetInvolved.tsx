import Section from "@/components/ui/Section";
import Button from "@/components/ui/Button";
import Eyebrow from "@/components/ui/Eyebrow";
import Reveal from "@/components/ui/Reveal";
import styles from "./GetInvolved.module.css";

const CARDS = [
  {
    title: "Volunteer",
    imageClass: styles.volunteerImage,
    heading: "Want to Help People Understand the Bible?",
    body: "We’re looking for developers, testers, translators, and people of faith who want to make an eternal impact.",
    href: "/volunteer",
    cta: "Join the Volunteer Team",
  },
  {
    title: "Coach",
    imageClass: styles.coachImage,
    heading: "Are You a Bible Leader?",
    body: "Weekly structured feedback across 11 dimensions that sharpens your teaching, deepens your small groups, and strengthens your ministry.",
    href: "/coach",
    cta: "Request Coaching",
  },
  {
    title: "Give",
    imageClass: styles.giveImage,
    heading: "Believe in the Mission?",
    body: "Your gift keeps Versemate 100% free and accessible to people around the world seeking to understand God’s Word.",
    href: "/give",
    cta: "Make a Donation",
  },
];

export default function GetInvolved() {
  return (
    <Section
      className="bg-dark-gradient"
      containerClassName="flex flex-col items-center gap-12 md:gap-16"
    >
      <Reveal className="flex flex-col items-center">
        <Eyebrow variant="light">Get Involved</Eyebrow>
      </Reveal>

      <div className="grid w-full gap-8 lg:grid-cols-3 lg:gap-8 xl:gap-10">
        {CARDS.map((card, index) => (
          <Reveal
            key={card.title}
            delayMs={index * 120}
            className="flex flex-col items-center gap-5"
          >
            <h2 className="m-0 font-merriweather text-3xl text-white">
              {card.title}
            </h2>

            <div
              className={`${styles.cardContent} flex w-full flex-1 flex-col items-center gap-6 overflow-hidden rounded-[30px] pb-6 md:rounded-[40px] lg:rounded-[50px]`}
            >
              <div className={`${styles.cardImage} ${card.imageClass} w-full`} />

              <div className="flex w-full flex-col items-center gap-3 px-6">
                <h3 className="m-0 text-center font-merriweather text-card-title text-white">
                  {card.heading}
                </h3>
                <p
                  className={`${styles.cardDescription} m-0 text-center font-inter text-card-body`}
                >
                  {card.body}
                </p>
              </div>

              <div className="mt-auto flex w-full justify-center px-6">
                <Button href={card.href} className="w-full max-w-[320px]">
                  {card.cta}
                </Button>
              </div>
            </div>
          </Reveal>
        ))}
      </div>

      <Reveal className="flex w-full max-w-[820px] flex-col items-center gap-3">
        <p className="m-0 text-center font-inter text-base font-medium text-brand-tan">
          Versemate is a 501(c)(3) nonprofit making the Bible easier to
          understand—for everyone, forever.
        </p>
        <p
          className={`${styles.bottomText2} m-0 text-center font-inter text-sm`}
        >
          Donations are tax-deductible in the U.S. | Built by believers. Guided
          by the Word.
        </p>
      </Reveal>
    </Section>
  );
}
