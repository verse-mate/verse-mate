/**
 * Seed corpus for the Jesus feature.
 *
 * This file is the content, not the mechanism — `jesus.seed.ts` reads it and
 * writes rows. Three conventions keep it maintainable:
 *
 *  1. Every entry carries an explicit `slug`. Slugs are the stable identity
 *     used by URLs, the timeline and the curated collections, so they are
 *     written out rather than derived from the title (which editors change).
 *
 *  2. Order within this file is `sort_order` in the database, and
 *     `jesus-events.project.ts` names a harmony cluster after its **first
 *     action entry** by that order. Adding an entry to an existing cluster
 *     ahead of the entry the event is named for therefore renames the event —
 *     but only on a database seeded from scratch, because the `jesus_events`
 *     upsert is `doNothing` on title. A fresh environment and production would
 *     disagree. So: **append to a cluster, never prepend**, and leave an
 *     existing lead's title and summary alone.
 *
 *  3. Chronology lives in `LIFE_TIMELINE`, not on the entries. Ordering the
 *     ministry is a curation decision that cuts across kinds, and expressing it
 *     as an ordered list of slugs per period makes it reviewable at a glance —
 *     and lets the seeder fail loudly on a typo instead of silently dropping an
 *     entry out of the timeline.
 *
 * Scripture references use the display form the rest of VerseMate writes
 * ("Mark 4:35-41", "Matthew 24"); the seeder parses them into structured
 * book/chapter/verse rows.
 */

export type SeedKind =
  | "TEACHING"
  | "QUESTION"
  | "COMMAND"
  | "CLAIM"
  | "MIRACLE"
  | "HEALING"
  | "ENCOUNTER"
  | "COMPASSION"
  | "CONFRONTATION"
  | "PARABLE";

export interface SeedEntry {
  slug: string;
  kind: SeedKind;
  title: string;
  summary: string;
  /** Display-form scripture references; the first is treated as primary. */
  refs: string[];
  /** Theme slugs from `JESUS_THEMES`. */
  themes: string[];
  /** The saying itself, when the entry *is* a saying. */
  quote?: string;
  quoteRef?: string;
  /** Groups parallel gospel tellings of one episode into a single event. */
  harmony?: string;
}

export interface SeedPeriod {
  slug: string;
  name: string;
  subtitle: string;
  description: string;
}

export interface SeedTheme {
  slug: string;
  name: string;
  description: string;
}

export interface SeedCollection {
  slug: string;
  name: string;
  subtitle: string;
  description: string;
  isFeatured: boolean;
  /** Dynamic membership. Mutually exclusive with `members`. */
  filter?: {
    kind?: string;
    kinds?: string[];
    theme?: string;
    book_id?: number;
  };
  /** Hand-picked, ordered membership. Mutually exclusive with `filter`. */
  members?: string[];
}

// ── Periods — the spine of "Follow His Life" ──────────────────────────────

export const JESUS_PERIODS: SeedPeriod[] = [
  {
    slug: "incarnation",
    name: "Incarnation & Birth",
    subtitle: "Matthew 1–2 · Luke 1–2 · John 1",
    description:
      "The Word becomes flesh. Angels announce Him, a virgin bears Him, shepherds and magi find Him, and a king tries to kill Him.",
  },
  {
    slug: "hidden-years",
    name: "The Hidden Years",
    subtitle: "Luke 2:40-52",
    description:
      "Nearly three decades pass in near silence. The one glimpse Scripture gives is a twelve-year-old in the temple, already about His Father's business.",
  },
  {
    slug: "preparation",
    name: "Baptism & Temptation",
    subtitle: "Matthew 3–4 · Mark 1 · Luke 3–4",
    description:
      "The Father speaks over Him at the Jordan, the Spirit drives Him into the wilderness, and He answers the tempter with Scripture alone.",
  },
  {
    slug: "early-ministry",
    name: "Early Ministry",
    subtitle: "John 1–4",
    description:
      "First disciples, first sign, first cleansing of the temple, and two conversations that define the gospel — with a ruler by night and a woman at noon.",
  },
  {
    slug: "galilean-ministry",
    name: "The Galilean Ministry",
    subtitle: "Matthew 4–15 · Mark 1–7 · Luke 4–9",
    description:
      "The crowds swell. He preaches the Kingdom on a hillside, heals whoever comes, calms a sea, and feeds thousands from a boy's lunch.",
  },
  {
    slug: "turning-point",
    name: "The Turning Point",
    subtitle: "Matthew 16–18 · Mark 8–9 · Luke 9",
    description:
      "At Caesarea Philippi Peter names Him Messiah — and from that moment He begins to speak plainly about the cross.",
  },
  {
    slug: "journey-to-jerusalem",
    name: "The Road to Jerusalem",
    subtitle: "Luke 9:51–19:27 · John 7–11",
    description:
      "He sets His face toward Jerusalem. Most of the parables belong to this stretch, told to crowds who do not yet know where the road ends.",
  },
  {
    slug: "passion-week",
    name: "Passion Week",
    subtitle: "Matthew 21–26 · Mark 11–14 · Luke 19–22 · John 12–17",
    description:
      "From the colt on Palm Sunday to the bread and cup in the upper room — seven days that the gospels slow almost to a standstill.",
  },
  {
    slug: "cross",
    name: "The Cross",
    subtitle: "Matthew 26–27 · Mark 14–15 · Luke 22–23 · John 18–19",
    description:
      "Betrayal, trial, and crucifixion. He answers almost nothing, forgives almost everyone, and finishes what He came to do.",
  },
  {
    slug: "resurrection",
    name: "Resurrection & Ascension",
    subtitle: "Matthew 28 · Mark 16 · Luke 24 · John 20–21",
    description:
      "An empty tomb, a gardener who says her name, a road to Emmaus, breakfast on a beach, and a commission that reaches every nation.",
  },
];

// ── Themes — the "Explore by Topic" row ───────────────────────────────────

export const JESUS_THEMES: SeedTheme[] = [
  {
    slug: "kingdom",
    name: "Kingdom",
    description:
      "The reign of God breaking into the world — what it is like, who enters it, and how it grows.",
  },
  {
    slug: "faith",
    name: "Faith",
    description:
      "Trust that acts. Where Jesus found it, where He marvelled at its absence, and what He said it could do.",
  },
  {
    slug: "salvation",
    name: "Salvation",
    description:
      "Being found, forgiven, and given life — why He came and what He came to accomplish.",
  },
  {
    slug: "prayer",
    name: "Prayer",
    description:
      "How He prayed and how He taught His followers to pray — persistently, privately, and to a Father.",
  },
  {
    slug: "money",
    name: "Money",
    description:
      "Possessions, generosity, and the two masters no one can serve at once.",
  },
  {
    slug: "judgment",
    name: "Judgment",
    description:
      "The reckoning He promised — separation, accountability, and the return of the Son of Man.",
  },
  {
    slug: "love",
    name: "Love",
    description:
      "Love for God, neighbour, stranger and enemy — the command He called greatest and the mark He gave His followers.",
  },
  {
    slug: "discipleship",
    name: "Discipleship",
    description:
      "What it costs to follow Him, and what He promised those who do.",
  },
  {
    slug: "prophecy",
    name: "Prophecy",
    description:
      "What He foretold — about Himself, Jerusalem, His followers, and the end of the age.",
  },
  {
    slug: "warnings",
    name: "Warnings",
    description:
      "The woes, the cautions, and the hard sayings He refused to soften.",
  },
];

// ── Entries ───────────────────────────────────────────────────────────────

export const JESUS_ENTRIES: SeedEntry[] = [
  // ═══ MIRACLES ═══════════════════════════════════════════════════════════
  {
    slug: "water-into-wine",
    kind: "MIRACLE",
    title: "Water into wine at Cana",
    summary:
      "At a wedding running out of wine, He turns six stone jars of water into the best wine of the feast — the first of His signs.",
    refs: ["John 2:1-11"],
    themes: ["kingdom", "faith"],
    harmony: "cana-wine",
  },
  {
    slug: "healing-the-officials-son",
    kind: "HEALING",
    title: "Healing the official's son",
    summary:
      "A royal official begs Him to come to Capernaum. Jesus heals from a day's journey away, and the father believes before he sees.",
    refs: ["John 4:46-54"],
    themes: ["faith"],
  },
  {
    slug: "miraculous-catch-of-fish",
    kind: "MIRACLE",
    title: "The miraculous catch of fish",
    summary:
      "After a fruitless night, Peter lets down the nets on His word and the catch nearly sinks two boats. Peter falls at His knees.",
    refs: ["Luke 5:1-11"],
    themes: ["faith", "discipleship"],
  },
  {
    slug: "unclean-spirit-in-capernaum",
    kind: "HEALING",
    title: "Driving out an unclean spirit in Capernaum",
    summary:
      "In the synagogue a demon names Him aloud. He silences it and casts it out, and the crowd realises His authority is not borrowed.",
    refs: ["Mark 1:21-28", "Luke 4:31-37"],
    themes: ["kingdom"],
    harmony: "capernaum-demoniac",
  },
  {
    slug: "healing-peters-mother-in-law",
    kind: "HEALING",
    title: "Healing Peter's mother-in-law",
    summary:
      "He takes her hand and the fever leaves. She gets up and serves them — the first thing healing produces is service.",
    refs: ["Matthew 8:14-15", "Mark 1:29-31", "Luke 4:38-39"],
    themes: ["love"],
    harmony: "peters-mother-in-law",
  },
  {
    slug: "cleansing-a-leper",
    kind: "HEALING",
    title: "Cleansing a leper",
    summary:
      '"If you are willing, you can make me clean." He reaches out and touches the untouchable before He says a word.',
    refs: ["Matthew 8:1-4", "Mark 1:40-45", "Luke 5:12-16"],
    themes: ["faith", "love"],
    harmony: "leper-cleansed",
  },
  {
    slug: "healing-the-paralytic",
    kind: "HEALING",
    title: "The paralytic lowered through the roof",
    summary:
      "Four friends dig through a roof. He forgives the man's sins first — then heals him to prove He had the right to.",
    refs: ["Matthew 9:1-8", "Mark 2:1-12", "Luke 5:17-26"],
    themes: ["faith", "salvation"],
    harmony: "paralytic-roof",
  },
  {
    slug: "healing-at-bethesda",
    kind: "HEALING",
    title: "Healing at the pool of Bethesda",
    summary:
      "Thirty-eight years of waiting end with a question and a command. It happens on a Sabbath, and the trouble begins.",
    refs: ["John 5:1-15"],
    themes: ["faith"],
  },
  {
    slug: "healing-the-withered-hand",
    kind: "HEALING",
    title: "Healing the man with the withered hand",
    summary:
      "They watch to see if He will heal on the Sabbath. He does it in the middle of the synagogue, grieved at their hard hearts.",
    refs: ["Matthew 12:9-14", "Mark 3:1-6", "Luke 6:6-11"],
    themes: ["love", "warnings"],
    harmony: "withered-hand",
  },
  {
    slug: "healing-the-centurions-servant",
    kind: "HEALING",
    title: "Healing the centurion's servant",
    summary:
      "A Roman officer says a word from a distance will do. Jesus marvels — He has not found such faith in Israel.",
    refs: ["Matthew 8:5-13", "Luke 7:1-10"],
    themes: ["faith"],
    harmony: "centurion-servant",
  },
  {
    slug: "raising-the-widows-son-at-nain",
    kind: "MIRACLE",
    title: "Raising the widow's son at Nain",
    summary:
      "He meets a funeral procession, has compassion on the mother, stops the bier and gives her son back to her.",
    refs: ["Luke 7:11-17"],
    themes: ["love", "salvation"],
  },
  {
    slug: "calming-the-storm",
    kind: "MIRACLE",
    title: "Calming the storm",
    summary:
      "Asleep in the stern through a squall. He rebukes the wind, then asks them why they were afraid.",
    refs: ["Matthew 8:23-27", "Mark 4:35-41", "Luke 8:22-25"],
    themes: ["faith"],
    harmony: "storm-stilled",
  },
  {
    slug: "healing-the-gerasene-demoniac",
    kind: "HEALING",
    title: "The Gerasene demoniac",
    summary:
      "A man no chain could hold is left clothed and in his right mind. The town asks Jesus to leave.",
    refs: ["Matthew 8:28-34", "Mark 5:1-20", "Luke 8:26-39"],
    themes: ["kingdom", "salvation"],
    harmony: "gerasene-demoniac",
  },
  {
    slug: "healing-the-bleeding-woman",
    kind: "HEALING",
    title: "The woman who touched His garment",
    summary:
      "Twelve years of bleeding, and no doctor could help. She touches the fringe of His cloak in a crowd and He stops everything to find her.",
    refs: ["Matthew 9:20-22", "Mark 5:25-34", "Luke 8:43-48"],
    themes: ["faith", "love"],
    harmony: "bleeding-woman",
  },
  {
    slug: "raising-jairus-daughter",
    kind: "MIRACLE",
    title: "Raising Jairus' daughter",
    summary:
      'A synagogue ruler\'s daughter dies while Jesus is delayed. He tells him only to believe, then takes her hand: "Little girl, arise."',
    refs: ["Matthew 9:18-26", "Mark 5:21-43", "Luke 8:40-56"],
    themes: ["faith", "salvation"],
    harmony: "jairus-daughter",
  },
  {
    slug: "healing-two-blind-men",
    kind: "HEALING",
    title: "Healing two blind men",
    summary:
      '"Do you believe that I am able to do this?" He touches their eyes according to their faith.',
    refs: ["Matthew 9:27-31"],
    themes: ["faith"],
  },
  {
    slug: "healing-a-mute-demoniac",
    kind: "HEALING",
    title: "Healing a mute demoniac",
    summary:
      "The crowds marvel; the Pharisees say He casts out demons by the prince of demons. The same act, two verdicts.",
    refs: ["Matthew 9:32-34"],
    themes: ["kingdom", "warnings"],
  },
  {
    slug: "feeding-the-five-thousand",
    kind: "MIRACLE",
    title: "Feeding the five thousand",
    summary:
      "Five loaves, two fish, and twelve baskets left over — the only miracle all four gospels record.",
    refs: ["Matthew 14:13-21", "Mark 6:30-44", "Luke 9:10-17", "John 6:1-14"],
    themes: ["kingdom", "faith"],
    harmony: "feeding-5000",
  },
  {
    slug: "walking-on-water",
    kind: "MIRACLE",
    title: "Walking on the water",
    summary:
      "He comes to them in the fourth watch. Peter walks, then looks at the wind, then sinks — and is caught.",
    refs: ["Matthew 14:22-33", "Mark 6:45-52", "John 6:16-21"],
    themes: ["faith"],
    harmony: "walking-on-water",
  },
  {
    slug: "healing-many-at-gennesaret",
    kind: "HEALING",
    title: "Many healed at Gennesaret",
    summary:
      "They run through the whole region carrying the sick on mats and beg only to touch the fringe of His cloak. Everyone who touches it is made well.",
    refs: ["Matthew 14:34-36", "Mark 6:53-56"],
    themes: ["faith", "love"],
    harmony: "gennesaret-healings",
  },
  {
    slug: "healing-the-syrophoenician-womans-daughter",
    kind: "HEALING",
    title: "The Syrophoenician woman's daughter",
    summary:
      "A Gentile mother refuses to be turned away and answers Him from inside His own metaphor. He calls her faith great.",
    refs: ["Matthew 15:21-28", "Mark 7:24-30"],
    themes: ["faith", "salvation"],
    harmony: "syrophoenician-woman",
  },
  {
    slug: "healing-a-deaf-and-mute-man",
    kind: "HEALING",
    title: "Healing a deaf and mute man",
    summary:
      'He takes the man aside privately, sighs, and says "Ephphatha" — be opened.',
    refs: ["Mark 7:31-37"],
    themes: ["love"],
  },
  {
    slug: "feeding-the-four-thousand",
    kind: "MIRACLE",
    title: "Feeding the four thousand",
    summary:
      'Three days without food in Gentile territory. "I have compassion on the crowd" — and He does it again.',
    refs: ["Matthew 15:32-39", "Mark 8:1-10"],
    themes: ["kingdom", "love"],
    harmony: "feeding-4000",
  },
  {
    slug: "healing-a-blind-man-at-bethsaida",
    kind: "HEALING",
    title: "The blind man at Bethsaida",
    summary:
      "The only healing that comes in two stages — first men like trees walking, then everything clearly.",
    refs: ["Mark 8:22-26"],
    themes: ["faith"],
  },
  {
    slug: "healing-the-boy-with-an-unclean-spirit",
    kind: "HEALING",
    title: "The boy with an unclean spirit",
    summary:
      '"I believe; help my unbelief!" A father\'s honest prayer at the foot of the mountain of transfiguration.',
    refs: ["Matthew 17:14-21", "Mark 9:14-29", "Luke 9:37-43"],
    themes: ["faith", "prayer"],
    harmony: "epileptic-boy",
  },
  {
    slug: "the-coin-in-the-fish",
    kind: "MIRACLE",
    title: "The coin in the fish's mouth",
    summary:
      "To avoid giving offence over the temple tax, He sends Peter fishing for exactly the right coin.",
    refs: ["Matthew 17:24-27"],
    themes: ["money", "kingdom"],
  },
  {
    slug: "healing-the-man-born-blind",
    kind: "HEALING",
    title: "The man born blind",
    summary:
      'Mud, a wash in Siloam, and an interrogation. "One thing I know: I was blind, now I see."',
    refs: ["John 9:1-41"],
    themes: ["faith", "judgment"],
  },
  {
    slug: "healing-the-crippled-woman",
    kind: "HEALING",
    title: "The woman bent double for eighteen years",
    summary:
      "He calls her over on a Sabbath and straightens her. The synagogue ruler is indignant; the crowd rejoices.",
    refs: ["Luke 13:10-17"],
    themes: ["love", "warnings"],
  },
  {
    slug: "healing-a-man-with-dropsy",
    kind: "HEALING",
    title: "Healing a man with dropsy",
    summary:
      "At a Pharisee's table, on a Sabbath, He asks whether it is lawful to heal — and no one will answer.",
    refs: ["Luke 14:1-6"],
    themes: ["love", "warnings"],
  },
  {
    slug: "cleansing-ten-lepers",
    kind: "HEALING",
    title: "Cleansing ten lepers",
    summary:
      "Ten are healed on the way. One comes back — and he is a Samaritan.",
    refs: ["Luke 17:11-19"],
    themes: ["faith", "salvation"],
  },
  {
    slug: "raising-lazarus",
    kind: "MIRACLE",
    title: "Raising Lazarus",
    summary:
      "Four days in the tomb. He weeps at the grave of a friend He is about to raise, and calls him out by name.",
    refs: ["John 11:1-44"],
    themes: ["faith", "salvation"],
  },
  {
    slug: "healing-blind-bartimaeus",
    kind: "HEALING",
    title: "Blind Bartimaeus",
    summary:
      "Shouted down by the crowd, he shouts louder. Jesus stops the procession and asks what he wants.",
    refs: ["Matthew 20:29-34", "Mark 10:46-52", "Luke 18:35-43"],
    themes: ["faith"],
    harmony: "bartimaeus",
  },
  {
    slug: "withering-the-fig-tree",
    kind: "MIRACLE",
    title: "Withering the fig tree",
    summary:
      "A tree in full leaf with no fruit, cursed on the way into Jerusalem — an acted parable about the temple.",
    refs: ["Matthew 21:18-22", "Mark 11:12-25"],
    themes: ["judgment", "faith"],
    harmony: "fig-tree-cursed",
  },
  {
    slug: "healing-the-servants-ear",
    kind: "HEALING",
    title: "Healing the servant's severed ear",
    summary:
      "His last miracle before the cross repairs the damage done by a disciple defending Him.",
    refs: ["Luke 22:49-51"],
    themes: ["love"],
  },
  {
    slug: "the-second-catch-of-fish",
    kind: "MIRACLE",
    title: "The catch of 153 fish",
    summary:
      "After the resurrection, another empty night and another word from the shore — and breakfast already cooking.",
    refs: ["John 21:1-14"],
    themes: ["discipleship", "faith"],
  },
  {
    slug: "the-transfiguration",
    kind: "MIRACLE",
    title: "The Transfiguration",
    summary:
      'On a high mountain His face shines like the sun. Moses and Elijah appear, and the Father speaks again: "Listen to Him."',
    refs: ["Matthew 17:1-8", "Mark 9:2-8", "Luke 9:28-36"],
    themes: ["kingdom", "prophecy"],
    harmony: "transfiguration",
  },

  // ═══ PARABLES ═══════════════════════════════════════════════════════════
  {
    slug: "parable-of-the-sower",
    kind: "PARABLE",
    title: "The Sower",
    summary:
      "One seed, four soils. The difference is never the seed — it is the ground it lands on.",
    quote:
      "Other seed fell into the good soil, and grew up, and produced a crop a hundred times as great.",
    quoteRef: "Luke 8:8",
    refs: ["Matthew 13:1-23", "Mark 4:1-20", "Luke 8:4-15"],
    themes: ["kingdom", "discipleship"],
    harmony: "parable-sower",
  },
  {
    slug: "parable-of-the-weeds",
    kind: "PARABLE",
    title: "The Weeds Among the Wheat",
    summary:
      "An enemy sows weeds in the night. The servants want to pull them; the owner says wait for the harvest.",
    quote:
      "So just as the tares are gathered up and burned with fire, so shall it be at the end of the age.",
    quoteRef: "Matthew 13:40",
    refs: ["Matthew 13:24-30", "Matthew 13:36-43"],
    themes: ["kingdom", "judgment"],
  },
  {
    slug: "parable-of-the-mustard-seed",
    kind: "PARABLE",
    title: "The Mustard Seed",
    summary:
      "The smallest of seeds becomes a tree the birds nest in. The Kingdom starts smaller than anyone expects.",
    quote:
      "It is like a mustard seed, which a man took and threw into his own garden; and it grew and became a tree, and the birds of the air nested in its branches.",
    quoteRef: "Luke 13:19",
    refs: ["Matthew 13:31-32", "Mark 4:30-32", "Luke 13:18-19"],
    themes: ["kingdom"],
    harmony: "parable-mustard-seed",
  },
  {
    slug: "parable-of-the-leaven",
    kind: "PARABLE",
    title: "The Leaven",
    summary:
      "A little yeast hidden in three measures of flour works through all of it — invisibly, and completely.",
    quote:
      "It is like leaven, which a woman took and hid in three pecks of flour until it was all leavened.",
    quoteRef: "Luke 13:21",
    refs: ["Matthew 13:33", "Luke 13:20-21"],
    themes: ["kingdom"],
    harmony: "parable-leaven",
  },
  {
    slug: "parable-of-the-hidden-treasure",
    kind: "PARABLE",
    title: "The Hidden Treasure",
    summary:
      "A man finds treasure in a field and sells everything he has for it — joyfully.",
    quote:
      "The kingdom of heaven is like a treasure hidden in the field, which a man found and hid again; and from joy over it he goes and sells all that he has and buys that field.",
    quoteRef: "Matthew 13:44",
    refs: ["Matthew 13:44"],
    themes: ["kingdom", "money"],
  },
  {
    slug: "parable-of-the-pearl",
    kind: "PARABLE",
    title: "The Pearl of Great Price",
    summary:
      "A merchant who knows pearls finds one worth more than all the rest, and liquidates his life to own it.",
    quote:
      "and upon finding one pearl of great value, he went and sold all that he had and bought it.",
    quoteRef: "Matthew 13:46",
    refs: ["Matthew 13:45-46"],
    themes: ["kingdom", "money"],
  },
  {
    slug: "parable-of-the-net",
    kind: "PARABLE",
    title: "The Net",
    summary:
      "A dragnet gathers fish of every kind. The sorting happens on the shore, not in the water.",
    quote:
      "So it will be at the end of the age; the angels will come forth and take out the wicked from among the righteous,",
    quoteRef: "Matthew 13:49",
    refs: ["Matthew 13:47-50"],
    themes: ["kingdom", "judgment"],
  },
  {
    slug: "parable-of-the-growing-seed",
    kind: "PARABLE",
    title: "The Growing Seed",
    summary:
      "The farmer sleeps and rises; the seed sprouts and grows, he knows not how. Growth is not his doing.",
    quote:
      "The soil produces crops by itself; first the blade, then the head, then the mature grain in the head.",
    quoteRef: "Mark 4:28",
    refs: ["Mark 4:26-29"],
    themes: ["kingdom", "faith"],
  },
  {
    slug: "parable-of-the-two-debtors",
    kind: "PARABLE",
    title: "The Two Debtors",
    summary:
      'Two debts cancelled, one ten times the other. "Which of them will love him more?"',
    quote: "When they were unable to repay, he graciously forgave them both.",
    quoteRef: "Luke 7:42",
    refs: ["Luke 7:41-43"],
    themes: ["love", "salvation"],
  },
  {
    slug: "parable-of-the-good-samaritan",
    kind: "PARABLE",
    title: "The Good Samaritan",
    summary:
      'Asked to define "neighbour," He tells a story that redefines the question — and makes the hero the wrong nationality.',
    quote:
      "Which of these three do you think proved to be a neighbor to the man who fell into the robbers’ hands?",
    quoteRef: "Luke 10:36",
    refs: ["Luke 10:25-37"],
    themes: ["love", "discipleship"],
  },
  {
    slug: "parable-of-the-friend-at-midnight",
    kind: "PARABLE",
    title: "The Friend at Midnight",
    summary:
      "A neighbour gets up not out of friendship but because of shameless persistence. So keep asking.",
    quote:
      "I tell you, even though he will not get up and give him anything because he is his friend, yet because of his persistence he will get up and give him as much as he needs.",
    quoteRef: "Luke 11:8",
    refs: ["Luke 11:5-8"],
    themes: ["prayer"],
  },
  {
    slug: "parable-of-the-rich-fool",
    kind: "PARABLE",
    title: "The Rich Fool",
    summary:
      'A bumper crop, bigger barns, and a comfortable retirement plan. "This night your soul is required of you."',
    quote:
      "So is the man who stores up treasure for himself, and is not rich toward God.",
    quoteRef: "Luke 12:21",
    refs: ["Luke 12:16-21"],
    themes: ["money", "judgment", "warnings"],
  },
  {
    slug: "parable-of-the-watchful-servants",
    kind: "PARABLE",
    title: "The Watchful Servants",
    summary:
      "Servants waiting up for a master returning from a wedding. Blessed are the ones he finds awake.",
    quote:
      "You too, be ready; for the Son of Man is coming at an hour that you do not expect.",
    quoteRef: "Luke 12:40",
    refs: ["Luke 12:35-40"],
    themes: ["discipleship", "prophecy"],
  },
  {
    slug: "parable-of-the-faithful-steward",
    kind: "PARABLE",
    title: "The Faithful and Wise Steward",
    summary:
      "Put in charge while the master is away. To whom much is given, much will be required.",
    quote:
      "From everyone who has been given much, much will be required; and to whom they entrusted much, of him they will ask all the more.",
    quoteRef: "Luke 12:48",
    refs: ["Luke 12:42-48", "Matthew 24:45-51"],
    themes: ["discipleship", "judgment"],
    harmony: "parable-faithful-steward",
  },
  {
    slug: "parable-of-the-barren-fig-tree",
    kind: "PARABLE",
    title: "The Barren Fig Tree",
    summary:
      "Three fruitless years and an owner ready to cut it down. The gardener asks for one more year.",
    quote: "and if it bears fruit next year, fine; but if not, cut it down.",
    quoteRef: "Luke 13:9",
    refs: ["Luke 13:6-9"],
    themes: ["judgment", "warnings"],
  },
  {
    slug: "parable-of-the-great-banquet",
    kind: "PARABLE",
    title: "The Great Banquet",
    summary:
      "Every invited guest has an excuse, so the host fills his house from the streets and the hedgerows.",
    quote:
      "Go out into the highways and along the hedges, and compel them to come in, so that my house may be filled.",
    quoteRef: "Luke 14:23",
    refs: ["Luke 14:15-24"],
    themes: ["kingdom", "salvation"],
  },
  {
    slug: "parable-of-the-tower-and-the-king",
    kind: "PARABLE",
    title: "The Tower and the King Going to War",
    summary:
      "Count the cost before you start building, or going to battle. Discipleship is not an impulse purchase.",
    quote:
      "So then, none of you can be My disciple who does not give up all his own possessions.",
    quoteRef: "Luke 14:33",
    refs: ["Luke 14:28-33"],
    themes: ["discipleship"],
  },
  {
    slug: "parable-of-the-lost-sheep",
    kind: "PARABLE",
    title: "The Lost Sheep",
    summary:
      "Ninety-nine left in the open country to go after one, and a party when it is carried home.",
    quote:
      "I tell you that in the same way, there will be more joy in heaven over one sinner who repents than over ninety-nine righteous persons who need no repentance.",
    quoteRef: "Luke 15:7",
    refs: ["Luke 15:3-7", "Matthew 18:12-14"],
    themes: ["salvation", "love"],
    harmony: "parable-lost-sheep",
  },
  {
    slug: "parable-of-the-lost-coin",
    kind: "PARABLE",
    title: "The Lost Coin",
    summary:
      "A woman sweeps the whole house for one coin, and calls in the neighbours when she finds it.",
    quote:
      "In the same way, I tell you, there is joy in the presence of the angels of God over one sinner who repents.",
    quoteRef: "Luke 15:10",
    refs: ["Luke 15:8-10"],
    themes: ["salvation"],
  },
  {
    slug: "parable-of-the-prodigal-son",
    kind: "PARABLE",
    title: "The Prodigal Son",
    summary:
      "A son who wanted his father dead, a father who ran to meet him, and an older brother who would not come in.",
    quote:
      "for this son of mine was dead and has come to life again; he was lost and has been found.",
    quoteRef: "Luke 15:24",
    refs: ["Luke 15:11-32"],
    themes: ["salvation", "love"],
  },
  {
    slug: "parable-of-the-shrewd-manager",
    kind: "PARABLE",
    title: "The Shrewd Manager",
    summary:
      "A dishonest steward buys himself a future. Use worldly wealth the way he used his last week of access.",
    quote:
      "And I say to you, make friends for yourselves by means of the wealth of unrighteousness, so that when it fails, they will receive you into the eternal dwellings.",
    quoteRef: "Luke 16:9",
    refs: ["Luke 16:1-13"],
    themes: ["money", "discipleship"],
  },
  {
    slug: "parable-of-the-rich-man-and-lazarus",
    kind: "PARABLE",
    title: "The Rich Man and Lazarus",
    summary:
      "A beggar at the gate and a man in purple. The gulf that was invisible in life turns out to be fixed.",
    quote:
      "And besides all this, between us and you there is a great chasm fixed, so that those who wish to come over from here to you will not be able, and that none may cross over from there to us.",
    quoteRef: "Luke 16:26",
    refs: ["Luke 16:19-31"],
    themes: ["money", "judgment", "warnings"],
  },
  {
    slug: "parable-of-the-unworthy-servants",
    kind: "PARABLE",
    title: "The Unworthy Servants",
    summary:
      "When you have done everything commanded, say: we are unworthy servants; we have only done our duty.",
    quote:
      "So you too, when you do all the things which are commanded you, say, ‘We are unworthy slaves; we have done only that which we ought to have done.’",
    quoteRef: "Luke 17:10",
    refs: ["Luke 17:7-10"],
    themes: ["discipleship"],
  },
  {
    slug: "parable-of-the-persistent-widow",
    kind: "PARABLE",
    title: "The Persistent Widow",
    summary:
      "She wears down an unjust judge. If he relents, how much more will a just Father hear?",
    quote:
      "now, will not God bring about justice for His elect who cry to Him day and night, and will He delay long over them?",
    quoteRef: "Luke 18:7",
    refs: ["Luke 18:1-8"],
    themes: ["prayer", "faith"],
  },
  {
    slug: "parable-of-the-pharisee-and-tax-collector",
    kind: "PARABLE",
    title: "The Pharisee and the Tax Collector",
    summary:
      "Two men pray. One lists his virtues; one will not lift his eyes. Only one goes home justified.",
    quote:
      "for everyone who exalts himself will be humbled, but he who humbles himself will be exalted.",
    quoteRef: "Luke 18:14",
    refs: ["Luke 18:9-14"],
    themes: ["prayer", "salvation"],
  },
  {
    slug: "parable-of-the-unforgiving-servant",
    kind: "PARABLE",
    title: "The Unforgiving Servant",
    summary:
      "Forgiven an unpayable debt, he throttles a man over pocket change. Forgiveness you keep is forgiveness you never took.",
    quote:
      "My heavenly Father will also do the same to you, if each of you does not forgive his brother from your heart.",
    quoteRef: "Matthew 18:35",
    refs: ["Matthew 18:21-35"],
    themes: ["love", "judgment"],
  },
  {
    slug: "parable-of-the-workers-in-the-vineyard",
    kind: "PARABLE",
    title: "The Workers in the Vineyard",
    summary:
      "Everyone gets a denarius, whether they worked twelve hours or one. Grace looks like unfairness from the front of the line.",
    quote: "So the last shall be first, and the first last.",
    quoteRef: "Matthew 20:16",
    refs: ["Matthew 20:1-16"],
    themes: ["kingdom", "salvation"],
  },
  {
    slug: "parable-of-the-two-sons",
    kind: "PARABLE",
    title: "The Two Sons",
    summary:
      "One says no and goes; one says yes and doesn't. Which one did the will of his father?",
    quote: "Which of the two did the will of his father?",
    quoteRef: "Matthew 21:31",
    refs: ["Matthew 21:28-32"],
    themes: ["kingdom", "discipleship"],
  },
  {
    slug: "parable-of-the-wicked-tenants",
    kind: "PARABLE",
    title: "The Wicked Tenants",
    summary:
      "Servant after servant is beaten, then the son is killed. The chief priests knew exactly who He meant.",
    quote:
      "What will the owner of the vineyard do? He will come and destroy the vine-growers, and will give the vineyard to others.",
    quoteRef: "Mark 12:9",
    refs: ["Matthew 21:33-46", "Mark 12:1-12", "Luke 20:9-19"],
    themes: ["judgment", "prophecy"],
    harmony: "parable-wicked-tenants",
  },
  {
    slug: "parable-of-the-wedding-feast",
    kind: "PARABLE",
    title: "The Wedding Feast",
    summary:
      "The invited will not come, so the hall is filled from the highways — and one guest is still turned out.",
    quote: "For many are called, but few are chosen.",
    quoteRef: "Matthew 22:14",
    refs: ["Matthew 22:1-14"],
    themes: ["kingdom", "judgment"],
  },
  {
    slug: "parable-of-the-fig-tree-in-leaf",
    kind: "PARABLE",
    title: "The Fig Tree in Leaf",
    summary:
      "When the branch is tender you know summer is near. Read the season you are living in.",
    quote:
      "so, you too, when you see all these things, recognize that He is near, right at the door.",
    quoteRef: "Matthew 24:33",
    refs: ["Matthew 24:32-35", "Mark 13:28-31", "Luke 21:29-33"],
    themes: ["prophecy"],
    harmony: "parable-fig-tree-lesson",
  },
  {
    slug: "parable-of-the-ten-virgins",
    kind: "PARABLE",
    title: "The Ten Virgins",
    summary:
      "Five brought extra oil, five didn't. The bridegroom was delayed, and readiness could not be borrowed at midnight.",
    quote: "Be on the alert then, for you do not know the day nor the hour.",
    quoteRef: "Matthew 25:13",
    refs: ["Matthew 25:1-13"],
    themes: ["prophecy", "warnings"],
  },
  {
    slug: "parable-of-the-talents",
    kind: "PARABLE",
    title: "The Talents",
    summary:
      "Two servants trade and double; one buries his in the ground and calls the master hard.",
    quote:
      "For to everyone who has, more shall be given, and he will have an abundance; but from the one who does not have, even what he does have shall be taken away.",
    quoteRef: "Matthew 25:29",
    refs: ["Matthew 25:14-30"],
    themes: ["discipleship", "judgment"],
  },
  {
    slug: "parable-of-the-minas",
    kind: "PARABLE",
    title: "The Ten Minas",
    summary:
      "A nobleman leaves to receive a kingdom, and his citizens send word that they will not have him reign.",
    quote:
      "I tell you that to everyone who has, more shall be given, but from the one who does not have, even what he does have shall be taken away.",
    quoteRef: "Luke 19:26",
    refs: ["Luke 19:11-27"],
    themes: ["kingdom", "judgment"],
  },
  {
    slug: "parable-of-the-sheep-and-the-goats",
    kind: "PARABLE",
    title: "The Sheep and the Goats",
    summary:
      'The nations are divided over meals given, clothes provided, prisons visited. "You did it to me."',
    quote:
      "Truly I say to you, to the extent that you did it to one of these brothers of Mine, even the least of them, you did it to Me.",
    quoteRef: "Matthew 25:40",
    refs: ["Matthew 25:31-46"],
    themes: ["judgment", "love"],
  },
  {
    slug: "parable-of-the-wise-and-foolish-builders",
    kind: "PARABLE",
    title: "The Wise and Foolish Builders",
    summary:
      "Two houses, one storm. The difference was invisible until the rain came — and it was the foundation.",
    quote:
      "Therefore everyone who hears these words of Mine and acts on them, may be compared to a wise man who built his house on the rock.",
    quoteRef: "Matthew 7:24",
    refs: ["Matthew 7:24-27", "Luke 6:47-49"],
    themes: ["discipleship", "warnings"],
    harmony: "parable-builders",
  },
  {
    slug: "parable-of-new-wine-and-old-wineskins",
    kind: "PARABLE",
    title: "New Wine and Old Wineskins",
    summary:
      "You cannot patch the new onto the old. What He brings will not fit inside what was there before.",
    quote: "But new wine must be put into fresh wineskins.",
    quoteRef: "Luke 5:38",
    refs: ["Matthew 9:16-17", "Mark 2:21-22", "Luke 5:36-39"],
    themes: ["kingdom"],
    harmony: "parable-wineskins",
  },
  {
    slug: "parable-of-the-lamp-under-a-basket",
    kind: "PARABLE",
    title: "The Lamp Under a Basket",
    summary:
      "Nobody lights a lamp to hide it. Nothing is concealed that will not be brought into the open.",
    quote:
      "For nothing is hidden, except to be revealed; nor has anything been secret, but that it would come to light.",
    quoteRef: "Mark 4:22",
    refs: ["Matthew 5:14-16", "Mark 4:21-25", "Luke 8:16-18"],
    themes: ["discipleship"],
    harmony: "parable-lamp",
  },
  {
    slug: "parable-of-the-good-shepherd",
    kind: "PARABLE",
    title: "The Good Shepherd and the Sheepfold",
    summary:
      "The sheep know the shepherd's voice. The hired hand runs; the shepherd lays down his life.",
    quote:
      "I am the good shepherd; the good shepherd lays down His life for the sheep.",
    quoteRef: "John 10:11",
    refs: ["John 10:1-18"],
    themes: ["salvation", "love"],
  },
  {
    slug: "parable-of-the-vine-and-branches",
    kind: "PARABLE",
    title: "The Vine and the Branches",
    summary:
      'Fruit is not produced by effort but by connection. "Apart from me you can do nothing."',
    quote:
      "I am the vine, you are the branches; he who abides in Me and I in him, he bears much fruit, for apart from Me you can do nothing.",
    quoteRef: "John 15:5",
    refs: ["John 15:1-8"],
    themes: ["discipleship", "faith"],
  },

  // ═══ CLAIMS ═════════════════════════════════════════════════════════════
  {
    slug: "i-am-the-bread-of-life",
    kind: "CLAIM",
    title: "I am the bread of life",
    summary:
      "Said the day after He fed five thousand, to a crowd that came back wanting more bread.",
    quote: "I am the bread of life; whoever comes to me shall not hunger.",
    quoteRef: "John 6:35",
    refs: ["John 6:35", "John 6:48-51"],
    themes: ["salvation", "faith"],
  },
  {
    slug: "i-am-the-light-of-the-world",
    kind: "CLAIM",
    title: "I am the light of the world",
    summary:
      "Spoken in the temple treasury, during a feast lit by enormous lampstands.",
    quote:
      "I am the light of the world. Whoever follows me will not walk in darkness.",
    quoteRef: "John 8:12",
    refs: ["John 8:12", "John 9:5"],
    themes: ["salvation", "discipleship"],
  },
  {
    slug: "i-am-the-door",
    kind: "CLAIM",
    title: "I am the door of the sheep",
    summary: "Not one way among several into the fold — the way in.",
    quote: "I am the door. If anyone enters by me, he will be saved.",
    quoteRef: "John 10:9",
    refs: ["John 10:7-10"],
    themes: ["salvation"],
  },
  {
    slug: "i-am-the-good-shepherd",
    kind: "CLAIM",
    title: "I am the good shepherd",
    summary:
      "The claim He defines by what it costs: the shepherd lays down his life for the sheep.",
    quote:
      "I am the good shepherd. The good shepherd lays down his life for the sheep.",
    quoteRef: "John 10:11",
    refs: ["John 10:11-18"],
    themes: ["love", "salvation"],
  },
  {
    slug: "i-am-the-resurrection-and-the-life",
    kind: "CLAIM",
    title: "I am the resurrection and the life",
    summary:
      "Said to Martha outside a tomb, four days too late — and then proved.",
    quote:
      "I am the resurrection and the life. Whoever believes in me, though he die, yet shall he live.",
    quoteRef: "John 11:25",
    refs: ["John 11:25-26"],
    themes: ["salvation", "faith"],
  },
  {
    slug: "i-am-the-way-the-truth-and-the-life",
    kind: "CLAIM",
    title: "I am the way, the truth, and the life",
    summary:
      "Thomas asks how they can know the way. The answer is not a map but a person.",
    quote:
      "I am the way, and the truth, and the life. No one comes to the Father except through me.",
    quoteRef: "John 14:6",
    refs: ["John 14:6"],
    themes: ["salvation"],
  },
  {
    slug: "i-am-the-true-vine",
    kind: "CLAIM",
    title: "I am the true vine",
    summary:
      "On the last night, the image He leaves them with is dependence, not effort.",
    quote: "I am the true vine, and my Father is the vinedresser.",
    quoteRef: "John 15:1",
    refs: ["John 15:1-8"],
    themes: ["discipleship"],
  },
  {
    slug: "before-abraham-was-i-am",
    kind: "CLAIM",
    title: "Before Abraham was, I AM",
    summary:
      "The claim that made them pick up stones — He took the divine name for Himself.",
    quote: "Truly, truly, I say to you, before Abraham was, I am.",
    quoteRef: "John 8:58",
    refs: ["John 8:56-59"],
    themes: ["prophecy"],
  },
  {
    slug: "lord-of-the-sabbath",
    kind: "CLAIM",
    title: "The Son of Man is Lord of the Sabbath",
    summary:
      "Challenged over His disciples picking grain, He claims authority over the day itself.",
    quote: "The Son of Man is lord of the Sabbath.",
    quoteRef: "Matthew 12:8",
    refs: ["Matthew 12:1-8", "Mark 2:23-28", "Luke 6:1-5"],
    themes: ["kingdom"],
    harmony: "lord-of-sabbath",
  },
  {
    slug: "i-and-the-father-are-one",
    kind: "CLAIM",
    title: "I and the Father are one",
    summary:
      "At the Feast of Dedication, pressed to say plainly whether He is the Christ.",
    quote: "I and the Father are one.",
    quoteRef: "John 10:30",
    refs: ["John 10:22-33"],
    themes: ["prophecy"],
  },
  {
    slug: "whoever-has-seen-me-has-seen-the-father",
    kind: "CLAIM",
    title: "Whoever has seen me has seen the Father",
    summary:
      "Philip asks to be shown the Father. Jesus answers that he has been looking at Him for three years.",
    quote: "Whoever has seen me has seen the Father.",
    quoteRef: "John 14:9",
    refs: ["John 14:7-11"],
    themes: ["faith"],
  },
  {
    slug: "all-authority-has-been-given-to-me",
    kind: "CLAIM",
    title: "All authority has been given to me",
    summary:
      "The claim that grounds the Great Commission — the sending rests on the authority.",
    quote: "All authority in heaven and on earth has been given to me.",
    quoteRef: "Matthew 28:18",
    refs: ["Matthew 28:18-20"],
    themes: ["kingdom", "discipleship"],
  },
  {
    slug: "i-who-speak-to-you-am-he",
    kind: "CLAIM",
    title: "I who speak to you am He",
    summary:
      "The first person He tells plainly that He is the Messiah is a Samaritan woman at a well.",
    quote: "I who speak to you am he.",
    quoteRef: "John 4:26",
    refs: ["John 4:25-26"],
    themes: ["salvation"],
  },
  {
    slug: "to-seek-and-save-the-lost",
    kind: "CLAIM",
    title: "The Son of Man came to seek and to save the lost",
    summary:
      "His own summary of why He came, said in the house of a tax collector everyone was grumbling about.",
    quote: "The Son of Man came to seek and to save the lost.",
    quoteRef: "Luke 19:10",
    refs: ["Luke 19:1-10"],
    themes: ["salvation", "love"],
  },
  {
    slug: "i-came-to-fulfil-the-law",
    kind: "CLAIM",
    title: "I came not to abolish the Law but to fulfil it",
    summary:
      "He positions Himself not against the Scriptures but as their destination.",
    quote:
      "Do not think that I have come to abolish the Law or the Prophets; I have not come to abolish them but to fulfill them.",
    quoteRef: "Matthew 5:17",
    refs: ["Matthew 5:17-20"],
    themes: ["kingdom", "prophecy"],
  },
  {
    slug: "greater-than-the-temple",
    kind: "CLAIM",
    title: "Something greater than the temple is here",
    summary:
      "Greater than the temple, greater than Jonah, greater than Solomon — three claims in one confrontation.",
    quote: "I tell you, something greater than the temple is here.",
    quoteRef: "Matthew 12:6",
    refs: ["Matthew 12:6", "Matthew 12:41-42"],
    themes: ["kingdom"],
  },
  {
    slug: "i-am-before-the-high-priest",
    kind: "CLAIM",
    title: '"I am" — before the high priest',
    summary:
      "Asked under oath whether He is the Christ, He answers directly, and it costs Him His life.",
    quote:
      "I am, and you will see the Son of Man seated at the right hand of Power.",
    quoteRef: "Mark 14:62",
    refs: ["Mark 14:60-64", "Matthew 26:62-66"],
    themes: ["prophecy"],
    harmony: "sanhedrin-trial",
  },
  {
    slug: "my-kingdom-is-not-of-this-world",
    kind: "CLAIM",
    title: "My kingdom is not of this world",
    summary:
      "Standing before Rome's governor, He concedes He is a king — of a kingdom Rome has no category for.",
    quote: "My kingdom is not of this world.",
    quoteRef: "John 18:36",
    refs: ["John 18:33-38"],
    themes: ["kingdom"],
  },
  {
    slug: "i-came-that-they-may-have-life",
    kind: "CLAIM",
    title: "I came that they may have life abundantly",
    summary: "Set against the thief who comes only to steal, kill and destroy.",
    quote: "I came that they may have life and have it abundantly.",
    quoteRef: "John 10:10",
    refs: ["John 10:10"],
    themes: ["salvation"],
  },
  {
    slug: "the-son-of-man-must-suffer",
    kind: "CLAIM",
    title: "The Son of Man must suffer",
    summary:
      "From Caesarea Philippi onward He says it plainly and repeatedly — and they keep not hearing it.",
    quote:
      "The Son of Man must suffer many things and be rejected, and be killed, and after three days rise again.",
    quoteRef: "Mark 8:31",
    refs: ["Mark 8:31", "Mark 9:31", "Mark 10:33-34"],
    themes: ["prophecy", "salvation"],
  },

  // ═══ QUESTIONS ══════════════════════════════════════════════════════════
  {
    slug: "who-do-you-say-that-i-am",
    kind: "QUESTION",
    title: "Who do you say that I am?",
    summary:
      "The hinge of the gospels. He asks what the crowds think first, then makes it personal.",
    quote: "But who do you say that I am?",
    quoteRef: "Matthew 16:15",
    refs: ["Matthew 16:13-20", "Mark 8:27-30", "Luke 9:18-21"],
    themes: ["faith", "discipleship"],
    harmony: "peters-confession",
  },
  {
    slug: "what-do-you-want-me-to-do-for-you",
    kind: "QUESTION",
    title: "What do you want me to do for you?",
    summary:
      "Asked of a blind beggar — and, in the same week, of two disciples angling for thrones.",
    quote: "What do you want me to do for you?",
    quoteRef: "Mark 10:51",
    refs: ["Mark 10:51", "Mark 10:36", "Luke 18:41"],
    themes: ["faith", "prayer"],
  },
  {
    slug: "why-are-you-afraid",
    kind: "QUESTION",
    title: "Why are you afraid, O you of little faith?",
    summary: "Asked in a boat, after the wind had already stopped.",
    quote: "Why are you afraid, O you of little faith?",
    quoteRef: "Matthew 8:26",
    refs: ["Matthew 8:26", "Mark 4:40", "Luke 8:25"],
    themes: ["faith"],
    harmony: "storm-stilled",
  },
  {
    slug: "who-touched-my-garments",
    kind: "QUESTION",
    title: "Who touched my garments?",
    summary:
      "In a crushing crowd He stops for one person He already knew He had healed.",
    quote: "Who touched my garments?",
    quoteRef: "Mark 5:30",
    refs: ["Mark 5:30-34"],
    themes: ["faith", "love"],
    harmony: "bleeding-woman",
  },
  {
    slug: "do-you-want-to-be-healed",
    kind: "QUESTION",
    title: "Do you want to be healed?",
    summary:
      "Asked of a man who had been lying by the pool for thirty-eight years.",
    quote: "Do you want to be healed?",
    quoteRef: "John 5:6",
    refs: ["John 5:1-9"],
    themes: ["faith"],
  },
  {
    slug: "what-are-you-seeking",
    kind: "QUESTION",
    title: "What are you seeking?",
    summary: "The first words He speaks in John's gospel.",
    quote: "What are you seeking?",
    quoteRef: "John 1:38",
    refs: ["John 1:35-39"],
    themes: ["discipleship"],
  },
  {
    slug: "do-you-love-me",
    kind: "QUESTION",
    title: "Do you love me?",
    summary:
      "Asked three times on a beach, once for each denial, and answered with a commission each time.",
    quote: "Simon, son of John, do you love me?",
    quoteRef: "John 21:16",
    refs: ["John 21:15-19"],
    themes: ["love", "discipleship"],
  },
  {
    slug: "why-do-you-call-me-good",
    kind: "QUESTION",
    title: "Why do you call me good?",
    summary:
      "A rich man opens with flattery. Jesus refuses it and goes straight to the man's real problem.",
    quote: "Why do you call me good? No one is good except God alone.",
    quoteRef: "Mark 10:18",
    refs: ["Mark 10:17-22", "Luke 18:18-23"],
    themes: ["money", "salvation"],
    harmony: "rich-young-ruler",
  },
  {
    slug: "what-does-it-profit-to-gain-the-world",
    kind: "QUESTION",
    title: "What does it profit a man to gain the whole world?",
    summary:
      "A cost-benefit question about the only asset that cannot be replaced.",
    quote:
      "For what does it profit a man to gain the whole world and forfeit his soul?",
    quoteRef: "Mark 8:36",
    refs: ["Matthew 16:26", "Mark 8:36-37", "Luke 9:25"],
    themes: ["money", "discipleship", "warnings"],
    harmony: "gain-the-world",
  },
  {
    slug: "which-of-you-by-being-anxious",
    kind: "QUESTION",
    title: "Which of you by being anxious can add an hour to his life?",
    summary:
      "Part of a sustained argument that worry is not only painful but useless.",
    quote:
      "And which of you by being anxious can add a single hour to his span of life?",
    quoteRef: "Matthew 6:27",
    refs: ["Matthew 6:25-34", "Luke 12:22-31"],
    themes: ["faith", "money"],
    harmony: "do-not-be-anxious",
  },
  {
    slug: "why-do-you-see-the-speck",
    kind: "QUESTION",
    title: "Why do you see the speck in your brother's eye?",
    summary:
      "The question is not whether the speck is there. It is what is in your own eye while you look.",
    quote:
      "Why do you see the speck that is in your brother's eye, but do not notice the log that is in your own eye?",
    quoteRef: "Matthew 7:3",
    refs: ["Matthew 7:1-5", "Luke 6:41-42"],
    themes: ["judgment", "love"],
    harmony: "speck-and-log",
  },
  {
    slug: "who-is-my-mother-and-my-brothers",
    kind: "QUESTION",
    title: "Who is my mother, and who are my brothers?",
    summary:
      "Told His family is outside asking for Him, He redraws the family line around obedience.",
    quote: "Who is my mother, and who are my brothers?",
    quoteRef: "Matthew 12:48",
    refs: ["Matthew 12:46-50", "Mark 3:31-35", "Luke 8:19-21"],
    themes: ["discipleship", "kingdom"],
    harmony: "true-family",
  },
  {
    slug: "do-you-not-yet-understand",
    kind: "QUESTION",
    title: "Do you not yet understand?",
    summary:
      "Seven rapid-fire questions to disciples worried about bread, days after two mass feedings.",
    quote: "Do you not yet perceive or understand? Are your hearts hardened?",
    quoteRef: "Mark 8:17",
    refs: ["Mark 8:14-21"],
    themes: ["faith", "warnings"],
  },
  {
    slug: "how-many-loaves-do-you-have",
    kind: "QUESTION",
    title: "How many loaves do you have?",
    summary:
      "Before He multiplies anything He asks them to inventory what little they actually hold.",
    quote: "How many loaves do you have? Go and see.",
    quoteRef: "Mark 6:38",
    refs: ["Mark 6:38", "Mark 8:5"],
    themes: ["faith"],
  },
  {
    slug: "where-is-your-faith",
    kind: "QUESTION",
    title: "Where is your faith?",
    summary:
      'Not "do you have faith" but where it went when the water started coming in.',
    quote: "Where is your faith?",
    quoteRef: "Luke 8:25",
    refs: ["Luke 8:22-25"],
    themes: ["faith"],
  },
  {
    slug: "whose-likeness-and-inscription",
    kind: "QUESTION",
    title: "Whose likeness and inscription is this?",
    summary:
      "Handed a trap about taxes, He asks for a coin and turns the question back on them.",
    quote: "Whose likeness and inscription is this?",
    quoteRef: "Matthew 22:20",
    refs: ["Matthew 22:15-22", "Mark 12:13-17", "Luke 20:20-26"],
    themes: ["money", "kingdom"],
    harmony: "taxes-to-caesar",
  },
  {
    slug: "which-proved-to-be-a-neighbour",
    kind: "QUESTION",
    title: "Which of these three proved to be a neighbour?",
    summary:
      "The lawyer asked who his neighbour was. Jesus makes him answer who acted like one.",
    quote:
      "Which of these three, do you think, proved to be a neighbor to the man who fell among the robbers?",
    quoteRef: "Luke 10:36",
    refs: ["Luke 10:25-37"],
    themes: ["love"],
  },
  {
    slug: "where-are-the-nine",
    kind: "QUESTION",
    title: "Were not ten cleansed? Where are the nine?",
    summary:
      "Ten lepers healed, one returned. The question is about gratitude, and it is left open.",
    quote: "Were not ten cleansed? Where are the nine?",
    quoteRef: "Luke 17:17",
    refs: ["Luke 17:11-19"],
    themes: ["faith", "salvation"],
  },
  {
    slug: "could-you-not-watch-one-hour",
    kind: "QUESTION",
    title: "Could you not watch with me one hour?",
    summary:
      "Asked in Gethsemane, of friends who kept falling asleep while He sweated.",
    quote: "So, could you not watch with me one hour?",
    quoteRef: "Matthew 26:40",
    refs: ["Matthew 26:36-46", "Mark 14:32-42"],
    themes: ["prayer", "discipleship"],
    harmony: "gethsemane",
  },
  {
    slug: "whom-are-you-seeking",
    kind: "QUESTION",
    title: "Whom are you seeking?",
    summary:
      "Asked of an armed detachment in a garden. He walks toward them, not away.",
    quote: "Whom do you seek?",
    quoteRef: "John 18:4",
    refs: ["John 18:1-9"],
    themes: ["salvation"],
  },
  {
    slug: "my-god-why-have-you-forsaken-me",
    kind: "QUESTION",
    title: "My God, my God, why have you forsaken me?",
    summary:
      "The hardest question in the gospels, and He is the one asking it — quoting Psalm 22 from the cross.",
    quote: "My God, my God, why have you forsaken me?",
    quoteRef: "Matthew 27:46",
    refs: ["Matthew 27:45-50", "Mark 15:33-37", "Psalms 22:1"],
    themes: ["salvation", "prophecy"],
    harmony: "cry-of-dereliction",
  },
  {
    slug: "woman-why-are-you-weeping",
    kind: "QUESTION",
    title: "Woman, why are you weeping?",
    summary:
      "The risen Christ's first recorded words, asked of someone who thought He was the gardener.",
    quote: "Woman, why are you weeping? Whom are you seeking?",
    quoteRef: "John 20:15",
    refs: ["John 20:11-18"],
    themes: ["love", "salvation"],
  },
  {
    slug: "do-you-believe-that-i-am-able",
    kind: "QUESTION",
    title: "Do you believe that I am able to do this?",
    summary:
      "Asked of two blind men before He touches their eyes — the healing follows the answer.",
    quote: "Do you believe that I am able to do this?",
    quoteRef: "Matthew 9:28",
    refs: ["Matthew 9:27-31"],
    themes: ["faith"],
  },
  {
    slug: "what-is-written-in-the-law",
    kind: "QUESTION",
    title: "What is written in the Law? How do you read it?",
    summary:
      "A lawyer tests Him with a question. He answers with two questions and lets the man convict himself.",
    quote: "What is written in the Law? How do you read it?",
    quoteRef: "Luke 10:26",
    refs: ["Luke 10:25-28"],
    themes: ["love", "kingdom"],
  },
  {
    slug: "have-you-never-read",
    kind: "QUESTION",
    title: "Have you never read…?",
    summary:
      "His standard reply to religious experts — not a new argument, but a passage they had somehow missed.",
    quote: "Have you never read in the Scriptures?",
    quoteRef: "Matthew 21:42",
    refs: ["Matthew 21:42", "Mark 2:25", "Mark 12:10"],
    themes: ["warnings", "prophecy"],
  },
  {
    slug: "why-do-you-seek-to-kill-me",
    kind: "QUESTION",
    title: "Why do you seek to kill me?",
    summary:
      "Asked openly in the temple courts, to a crowd that denied they were doing any such thing.",
    quote: "Why do you seek to kill me?",
    quoteRef: "John 7:19",
    refs: ["John 7:14-24"],
    themes: ["warnings", "judgment"],
  },
  {
    slug: "do-you-believe-in-the-son-of-man",
    kind: "QUESTION",
    title: "Do you believe in the Son of Man?",
    summary:
      "He goes looking for the man born blind after the synagogue throws him out.",
    quote: "Do you believe in the Son of Man?",
    quoteRef: "John 9:35",
    refs: ["John 9:35-38"],
    themes: ["faith", "salvation"],
  },

  // ═══ COMMANDS ═══════════════════════════════════════════════════════════
  {
    slug: "follow-me",
    kind: "COMMAND",
    title: "Follow me",
    summary:
      "Two words, no résumé requested, no terms negotiated. He says it to fishermen, a tax collector, and a rich man who walks away.",
    quote: "Follow me, and I will make you fishers of men.",
    quoteRef: "Matthew 4:19",
    refs: ["Matthew 4:18-22", "Mark 1:16-20", "Luke 5:27-28", "John 1:43"],
    themes: ["discipleship"],
    harmony: "call-of-disciples",
  },
  {
    slug: "repent-for-the-kingdom-is-at-hand",
    kind: "COMMAND",
    title: "Repent, for the kingdom of heaven is at hand",
    summary:
      "The first thing He preaches, and the summary of everything after.",
    quote: "Repent, for the kingdom of heaven is at hand.",
    quoteRef: "Matthew 4:17",
    refs: ["Matthew 4:17", "Mark 1:14-15"],
    themes: ["kingdom", "salvation"],
    harmony: "first-preaching",
  },
  {
    slug: "love-your-enemies",
    kind: "COMMAND",
    title: "Love your enemies",
    summary:
      "The command that has no natural constituency — and the one He grounds in the character of the Father.",
    quote: "Love your enemies and pray for those who persecute you.",
    quoteRef: "Matthew 5:44",
    refs: ["Matthew 5:43-48", "Luke 6:27-36"],
    themes: ["love", "prayer"],
    harmony: "love-your-enemies",
  },
  {
    slug: "love-one-another",
    kind: "COMMAND",
    title: "Love one another as I have loved you",
    summary:
      "Given the night before the cross, with the standard of comparison about to be demonstrated.",
    quote:
      "A new commandment I give to you, that you love one another: just as I have loved you.",
    quoteRef: "John 13:34",
    refs: ["John 13:34-35", "John 15:12-17"],
    themes: ["love", "discipleship"],
  },
  {
    slug: "the-greatest-commandment",
    kind: "COMMAND",
    title: "Love God, love your neighbour",
    summary:
      "Asked to rank 613 commandments, He gives two — and says everything else hangs on them.",
    quote:
      "You shall love the Lord your God with all your heart… and your neighbor as yourself.",
    quoteRef: "Matthew 22:37-39",
    refs: ["Matthew 22:34-40", "Mark 12:28-34", "Luke 10:27"],
    themes: ["love", "kingdom"],
    harmony: "greatest-commandment",
  },
  {
    slug: "do-not-judge",
    kind: "COMMAND",
    title: "Judge not, that you be not judged",
    summary:
      "Not a ban on discernment — a warning that the measure you use will be used on you.",
    quote: "Judge not, that you be not judged.",
    quoteRef: "Matthew 7:1",
    refs: ["Matthew 7:1-5", "Luke 6:37-42"],
    themes: ["judgment", "love"],
    harmony: "speck-and-log",
  },
  {
    slug: "ask-seek-knock",
    kind: "COMMAND",
    title: "Ask, seek, knock",
    summary:
      "Three imperatives in the present tense: keep asking, keep seeking, keep knocking.",
    quote: "Ask, and it will be given to you; seek, and you will find.",
    quoteRef: "Matthew 7:7",
    refs: ["Matthew 7:7-11", "Luke 11:9-13"],
    themes: ["prayer", "faith"],
    harmony: "ask-seek-knock",
  },
  {
    slug: "seek-first-the-kingdom",
    kind: "COMMAND",
    title: "Seek first the kingdom of God",
    summary:
      "The antidote He prescribes for anxiety is not less caring but a reordered first priority.",
    quote:
      "But seek first the kingdom of God and his righteousness, and all these things will be added to you.",
    quoteRef: "Matthew 6:33",
    refs: ["Matthew 6:33", "Luke 12:31"],
    themes: ["kingdom", "money"],
    harmony: "do-not-be-anxious",
  },
  {
    slug: "do-not-be-anxious",
    kind: "COMMAND",
    title: "Do not be anxious about your life",
    summary:
      "Birds, lilies, and the observation that worry has never once added anything to anyone.",
    quote: "Therefore do not be anxious about tomorrow.",
    quoteRef: "Matthew 6:34",
    refs: ["Matthew 6:25-34", "Luke 12:22-31"],
    themes: ["faith", "money"],
    harmony: "do-not-be-anxious",
  },
  {
    slug: "make-disciples-of-all-nations",
    kind: "COMMAND",
    title: "Go and make disciples of all nations",
    summary:
      "The last command, given on a mountain in Galilee to eleven men, some of whom still doubted.",
    quote:
      "Go therefore and make disciples of all nations, baptizing them… teaching them to observe all that I have commanded you.",
    quoteRef: "Matthew 28:19-20",
    refs: ["Matthew 28:16-20", "Mark 16:15"],
    themes: ["discipleship", "kingdom"],
  },
  {
    slug: "do-this-in-remembrance-of-me",
    kind: "COMMAND",
    title: "Do this in remembrance of me",
    summary:
      "Bread broken and a cup poured out, with an instruction to keep repeating it.",
    quote:
      "This is my body, which is given for you. Do this in remembrance of me.",
    quoteRef: "Luke 22:19",
    refs: ["Luke 22:14-20", "Matthew 26:26-29", "Mark 14:22-25"],
    themes: ["salvation", "discipleship"],
    harmony: "last-supper",
  },
  {
    slug: "take-up-your-cross",
    kind: "COMMAND",
    title: "Take up your cross and follow me",
    summary:
      "Said to people who had watched actual crucifixions. It was not a metaphor for inconvenience.",
    quote:
      "If anyone would come after me, let him deny himself and take up his cross and follow me.",
    quoteRef: "Matthew 16:24",
    refs: ["Matthew 16:24-26", "Mark 8:34-38", "Luke 9:23-26"],
    themes: ["discipleship"],
    harmony: "take-up-cross",
  },
  {
    slug: "let-the-children-come",
    kind: "COMMAND",
    title: "Let the little children come to me",
    summary:
      "The disciples were managing His schedule. He was indignant, and He made time.",
    quote:
      "Let the little children come to me and do not hinder them, for to such belongs the kingdom of God.",
    quoteRef: "Mark 10:14",
    refs: ["Matthew 19:13-15", "Mark 10:13-16", "Luke 18:15-17"],
    themes: ["kingdom", "love"],
    harmony: "blessing-children",
  },
  {
    slug: "forgive-seventy-times-seven",
    kind: "COMMAND",
    title: "Forgive seventy times seven",
    summary:
      "Peter offers seven times, thinking himself generous. Jesus removes the ceiling entirely.",
    quote: "I do not say to you seven times, but seventy-seven times.",
    quoteRef: "Matthew 18:22",
    refs: ["Matthew 18:21-35", "Luke 17:3-4"],
    themes: ["love", "salvation"],
  },
  {
    slug: "pray-like-this",
    kind: "COMMAND",
    title: "Pray then like this",
    summary:
      "The prayer He gave when asked how to pray — short, corporate, and addressed to a Father.",
    quote: "Our Father in heaven, hallowed be your name.",
    quoteRef: "Matthew 6:9",
    refs: ["Matthew 6:5-15", "Luke 11:1-4"],
    themes: ["prayer"],
    harmony: "lords-prayer",
  },
  {
    slug: "enter-through-the-narrow-gate",
    kind: "COMMAND",
    title: "Enter by the narrow gate",
    summary:
      "Two gates, two roads, two destinations — and the popular one is not the one He recommends.",
    quote: "Enter by the narrow gate.",
    quoteRef: "Matthew 7:13",
    refs: ["Matthew 7:13-14", "Luke 13:22-30"],
    themes: ["salvation", "warnings"],
  },
  {
    slug: "render-to-caesar",
    kind: "COMMAND",
    title: "Render to Caesar what is Caesar's",
    summary:
      "An answer that escapes the trap and quietly asserts that everything bearing God's image belongs to God.",
    quote:
      "Render to Caesar the things that are Caesar's, and to God the things that are God's.",
    quoteRef: "Mark 12:17",
    refs: ["Matthew 22:15-22", "Mark 12:13-17", "Luke 20:20-26"],
    themes: ["money", "kingdom"],
    harmony: "taxes-to-caesar",
  },
  {
    slug: "abide-in-me",
    kind: "COMMAND",
    title: "Abide in me",
    summary:
      "The one command in the vineyard discourse, and everything else is said to follow from it.",
    quote: "Abide in me, and I in you.",
    quoteRef: "John 15:4",
    refs: ["John 15:1-11"],
    themes: ["discipleship", "faith"],
  },
  {
    slug: "watch-and-pray",
    kind: "COMMAND",
    title: "Watch and pray",
    summary:
      "Given in Gethsemane with an unusually candid diagnosis: the spirit is willing, the flesh is weak.",
    quote:
      "Watch and pray that you may not enter into temptation. The spirit indeed is willing, but the flesh is weak.",
    quoteRef: "Matthew 26:41",
    refs: ["Matthew 26:41", "Mark 14:38"],
    themes: ["prayer", "warnings"],
    harmony: "gethsemane",
  },
  {
    slug: "let-not-your-hearts-be-troubled",
    kind: "COMMAND",
    title: "Let not your hearts be troubled",
    summary:
      "Said hours before His arrest, to people about to lose everything they had built their lives around.",
    quote:
      "Let not your hearts be troubled. Believe in God; believe also in me.",
    quoteRef: "John 14:1",
    refs: ["John 14:1-4", "John 14:27"],
    themes: ["faith", "love"],
  },
  {
    slug: "feed-my-sheep",
    kind: "COMMAND",
    title: "Feed my sheep",
    summary:
      "Peter's restoration is not a pardon and a discharge — it is a pardon and a job.",
    quote: "Feed my sheep.",
    quoteRef: "John 21:17",
    refs: ["John 21:15-19"],
    themes: ["discipleship", "love"],
  },
  {
    slug: "go-and-sin-no-more",
    kind: "COMMAND",
    title: "Go, and from now on sin no more",
    summary:
      "Said after every accuser had walked away — neither condemnation nor permission.",
    quote: "Neither do I condemn you; go, and from now on sin no more.",
    quoteRef: "John 8:11",
    refs: ["John 8:1-11"],
    themes: ["salvation", "love"],
  },
  {
    slug: "give-to-the-one-who-asks",
    kind: "COMMAND",
    title: "Give to the one who asks of you",
    summary:
      "No means test, no assessment of deserving — an instruction that assumes you will sometimes be taken advantage of.",
    quote: "Give to the one who begs from you.",
    quoteRef: "Matthew 5:42",
    refs: ["Matthew 5:38-42", "Luke 6:30-35"],
    themes: ["money", "love"],
  },
  {
    slug: "the-golden-rule",
    kind: "COMMAND",
    title: "Do to others as you would have them do to you",
    summary:
      "Stated positively rather than as a prohibition — and called the sum of the Law and the Prophets.",
    quote: "So whatever you wish that others would do to you, do also to them.",
    quoteRef: "Matthew 7:12",
    refs: ["Matthew 7:12", "Luke 6:31"],
    themes: ["love"],
    harmony: "golden-rule",
  },
  {
    slug: "let-your-light-shine",
    kind: "COMMAND",
    title: "Let your light shine before others",
    summary:
      "Visibility with a redirected credit line — so they see your works and glorify your Father.",
    quote:
      "Let your light shine before others, so that they may see your good works and give glory to your Father.",
    quoteRef: "Matthew 5:16",
    refs: ["Matthew 5:13-16"],
    themes: ["discipleship"],
  },
  {
    slug: "sell-what-you-have-and-give",
    kind: "COMMAND",
    title: "Go, sell what you have and give to the poor",
    summary:
      "Said to one man, about one obstacle. He went away sorrowful, because he had great possessions.",
    quote:
      "Go, sell all that you have and give to the poor, and you will have treasure in heaven; and come, follow me.",
    quoteRef: "Mark 10:21",
    refs: ["Matthew 19:16-30", "Mark 10:17-31", "Luke 18:18-30"],
    themes: ["money", "discipleship"],
    harmony: "rich-young-ruler",
  },
  {
    slug: "beware-the-leaven-of-the-pharisees",
    kind: "COMMAND",
    title: "Beware the leaven of the Pharisees",
    summary:
      "A small amount of hypocrisy, He warns, does to a life what yeast does to dough.",
    quote: "Beware of the leaven of the Pharisees, which is hypocrisy.",
    quoteRef: "Luke 12:1",
    refs: ["Matthew 16:5-12", "Mark 8:14-21", "Luke 12:1-3"],
    themes: ["warnings"],
    harmony: "leaven-of-pharisees",
  },
  {
    slug: "stay-awake",
    kind: "COMMAND",
    title: "Stay awake — you do not know the day",
    summary:
      "The practical conclusion of the Olivet Discourse: not prediction, but readiness.",
    quote:
      "Therefore, stay awake, for you do not know on what day your Lord is coming.",
    quoteRef: "Matthew 24:42",
    refs: ["Matthew 24:42-44", "Mark 13:32-37"],
    themes: ["prophecy", "warnings"],
    harmony: "stay-awake",
  },

  // ═══ TEACHINGS ══════════════════════════════════════════════════════════
  {
    slug: "the-beatitudes",
    kind: "TEACHING",
    title: "The Beatitudes",
    summary:
      "He opens the Sermon on the Mount by congratulating exactly the people nobody congratulates.",
    quote:
      "Blessed are the poor in spirit, for theirs is the kingdom of heaven.",
    quoteRef: "Matthew 5:3",
    refs: ["Matthew 5:1-12", "Luke 6:20-26"],
    themes: ["kingdom", "discipleship"],
    harmony: "beatitudes",
  },
  {
    slug: "salt-and-light",
    kind: "TEACHING",
    title: "Salt and Light",
    summary:
      "Two images for the same point: His followers are for the world, not withdrawn from it.",
    quote:
      "Let your light shine before men in such a way that they may see your good works, and glorify your Father who is in heaven.",
    quoteRef: "Matthew 5:16",
    refs: ["Matthew 5:13-16"],
    themes: ["discipleship"],
  },
  {
    slug: "teaching-on-anger",
    kind: "TEACHING",
    title: "On anger and reconciliation",
    summary:
      "He traces murder back to contempt, and tells you to leave your gift at the altar and go make it right.",
    quote:
      "leave your offering there before the altar and go; first be reconciled to your brother, and then come and present your offering.",
    quoteRef: "Matthew 5:24",
    refs: ["Matthew 5:21-26"],
    themes: ["love", "warnings"],
  },
  {
    slug: "teaching-on-lust",
    kind: "TEACHING",
    title: "On lust and the heart",
    summary:
      "The commandment reaches past the act to the look, and the remedy He prescribes is drastic.",
    quote:
      "but I say to you that everyone who looks at a woman with lust for her has already committed adultery with her in his heart.",
    quoteRef: "Matthew 5:28",
    refs: ["Matthew 5:27-30"],
    themes: ["warnings", "discipleship"],
  },
  {
    slug: "teaching-on-divorce-and-marriage",
    kind: "TEACHING",
    title: "On divorce and marriage",
    summary:
      "Asked which grounds are permissible, He goes back past Moses to Genesis and the intention behind it.",
    quote: "What therefore God has joined together, let no man separate.",
    quoteRef: "Matthew 19:6",
    refs: ["Matthew 5:31-32", "Matthew 19:3-12", "Mark 10:2-12"],
    themes: ["love"],
    harmony: "divorce-teaching",
  },
  {
    slug: "teaching-on-oaths",
    kind: "TEACHING",
    title: "On oaths and plain speech",
    summary:
      "Do not swear at all. Let your yes be yes — integrity that needs no escalation.",
    quote:
      "But let your statement be, ‘Yes, yes’ or ‘No, no’; anything beyond these is of evil.",
    quoteRef: "Matthew 5:37",
    refs: ["Matthew 5:33-37"],
    themes: ["discipleship"],
  },
  {
    slug: "teaching-on-retaliation",
    kind: "TEACHING",
    title: "On retaliation",
    summary:
      "The other cheek, the second mile, the cloak as well — refusing to let an aggressor set the terms.",
    quote:
      "But I say to you, do not resist an evil person; but whoever slaps you on your right cheek, turn the other to him also.",
    quoteRef: "Matthew 5:39",
    refs: ["Matthew 5:38-42", "Luke 6:29-31"],
    themes: ["love"],
  },
  {
    slug: "teaching-on-giving",
    kind: "TEACHING",
    title: "On giving to the needy",
    summary:
      "Give so quietly that your left hand does not know. The audience you play to is the reward you get.",
    quote:
      "so that your giving will be in secret; and your Father who sees what is done in secret will reward you.",
    quoteRef: "Matthew 6:4",
    refs: ["Matthew 6:1-4"],
    themes: ["money", "warnings"],
  },
  {
    slug: "teaching-on-prayer",
    kind: "TEACHING",
    title: "On how to pray",
    summary:
      "Not performed on street corners, not padded with many words — go into your room and shut the door.",
    quote:
      "But you, when you pray, go into your inner room, close your door and pray to your Father who is in secret, and your Father who sees what is done in secret will reward you.",
    quoteRef: "Matthew 6:6",
    refs: ["Matthew 6:5-15", "Luke 11:1-13"],
    themes: ["prayer"],
    harmony: "lords-prayer",
  },
  {
    slug: "teaching-on-fasting",
    kind: "TEACHING",
    title: "On fasting",
    summary:
      "Wash your face and comb your hair. The point is not to be seen doing it.",
    quote:
      "so that your fasting will not be noticed by men, but by your Father who is in secret; and your Father who sees what is done in secret will reward you.",
    quoteRef: "Matthew 6:18",
    refs: ["Matthew 6:16-18"],
    themes: ["discipleship"],
  },
  {
    slug: "treasures-in-heaven",
    kind: "TEACHING",
    title: "Treasures in heaven and two masters",
    summary:
      "Where your treasure is, your heart follows — and no one can serve God and money.",
    quote: "for where your treasure is, there your heart will be also.",
    quoteRef: "Matthew 6:21",
    refs: ["Matthew 6:19-24", "Luke 12:33-34", "Luke 16:13"],
    themes: ["money", "kingdom"],
    harmony: "treasure-and-masters",
  },
  {
    slug: "a-tree-and-its-fruit",
    kind: "TEACHING",
    title: "A tree and its fruit",
    summary:
      "False prophets are identified not by their claims but by what grows on them over time.",
    quote: "For each tree is known by its own fruit.",
    quoteRef: "Luke 6:44",
    refs: ["Matthew 7:15-20", "Luke 6:43-45"],
    themes: ["warnings", "discipleship"],
    harmony: "tree-and-fruit",
  },
  {
    slug: "you-must-be-born-again",
    kind: "TEACHING",
    title: "You must be born again",
    summary:
      "To a Pharisee who came at night, He says the kingdom is not entered by improvement but by birth.",
    quote:
      "Truly, truly, I say to you, unless one is born again he cannot see the kingdom of God.",
    quoteRef: "John 3:3",
    refs: ["John 3:1-21"],
    themes: ["salvation", "kingdom"],
  },
  {
    slug: "living-water",
    kind: "TEACHING",
    title: "Living water",
    summary:
      "At a well at noon, to a woman with five husbands, He offers water that ends thirst permanently.",
    quote:
      "but whoever drinks of the water that I will give him shall never thirst; but the water that I will give him will become in him a well of water springing up to eternal life.",
    quoteRef: "John 4:14",
    refs: ["John 4:1-26"],
    themes: ["salvation"],
  },
  {
    slug: "the-bread-of-life-discourse",
    kind: "TEACHING",
    title: "The bread of life discourse",
    summary:
      "The hardest sermon He preached, measured by results: many of His disciples turned back and no longer walked with Him.",
    quote: "You do not want to go away also, do you?",
    quoteRef: "John 6:67",
    refs: ["John 6:22-71"],
    themes: ["salvation", "faith"],
  },
  {
    slug: "the-good-shepherd-discourse",
    kind: "TEACHING",
    title: "The Good Shepherd discourse",
    summary:
      "Sheep, shepherd, hired hand, thief, and one flock — an extended claim about who He is and what He will do.",
    quote:
      "I am the good shepherd; the good shepherd lays down His life for the sheep.",
    quoteRef: "John 10:11",
    refs: ["John 10:1-21"],
    themes: ["salvation", "love"],
  },
  {
    slug: "the-olivet-discourse",
    kind: "TEACHING",
    title: "The Olivet Discourse",
    summary:
      "Sitting opposite the temple He has just left, He describes its fall and His return, and tells them to keep watch.",
    quote:
      "“Therefore be on the alert, for you do not know which day your Lord is coming.",
    quoteRef: "Matthew 24:42",
    refs: ["Matthew 24:1-51", "Mark 13:1-37", "Luke 21:5-36"],
    themes: ["prophecy", "judgment", "warnings"],
    harmony: "olivet-discourse",
  },
  {
    slug: "the-upper-room-discourse",
    kind: "TEACHING",
    title: "The Upper Room Discourse",
    summary:
      "Four chapters of last words: a place prepared, a Helper promised, a vine, and peace not as the world gives.",
    quote:
      "Peace I leave with you; My peace I give to you; not as the world gives do I give to you.",
    quoteRef: "John 14:27",
    refs: ["John 14:1-31", "John 15:1-27", "John 16:1-33"],
    themes: ["love", "discipleship", "prophecy"],
  },
  {
    slug: "the-high-priestly-prayer",
    kind: "TEACHING",
    title: "The High Priestly Prayer",
    summary:
      "He prays aloud for Himself, for the eleven, and for everyone who would ever believe through their word.",
    quote: "Sanctify them in the truth; Your word is truth.",
    quoteRef: "John 17:17",
    refs: ["John 17:1-26"],
    themes: ["prayer", "love"],
  },
  {
    slug: "teaching-on-greatness",
    kind: "TEACHING",
    title: "On greatness and servanthood",
    summary:
      "Two disciples ask for the best seats. He redefines the ranking: whoever would be great must serve.",
    quote:
      "It is not this way among you, but whoever wishes to become great among you shall be your servant,",
    quoteRef: "Matthew 20:26",
    refs: ["Matthew 20:20-28", "Mark 10:35-45", "Luke 22:24-27"],
    themes: ["discipleship", "kingdom"],
    harmony: "greatness-servanthood",
  },
  {
    slug: "teaching-on-the-cost-of-discipleship",
    kind: "TEACHING",
    title: "On the cost of discipleship",
    summary:
      "Great crowds are following Him, so He turns and tells them exactly what it will take.",
    quote:
      "So then, none of you can be My disciple who does not give up all his own possessions.",
    quoteRef: "Luke 14:33",
    refs: ["Luke 14:25-33"],
    themes: ["discipleship", "warnings"],
  },
  {
    slug: "teaching-on-the-sabbath",
    kind: "TEACHING",
    title: "The Sabbath was made for man",
    summary:
      "Confronted about grain picked on a rest day, He states the purpose the rule was serving.",
    quote: "The Sabbath was made for man, and not man for the Sabbath.",
    quoteRef: "Mark 2:27",
    refs: ["Mark 2:23-28", "Matthew 12:1-8", "Luke 6:1-5"],
    themes: ["kingdom", "love"],
    harmony: "lord-of-sabbath",
  },
  {
    slug: "what-defiles-a-person",
    kind: "TEACHING",
    title: "What defiles a person",
    summary:
      "Not what goes into the mouth but what comes out of the heart — and He lists what comes out.",
    quote:
      "But the things that proceed out of the mouth come from the heart, and those defile the man.",
    quoteRef: "Matthew 15:18",
    refs: ["Matthew 15:1-20", "Mark 7:1-23"],
    themes: ["warnings"],
    harmony: "defilement-teaching",
  },
  {
    slug: "the-widows-offering",
    kind: "TEACHING",
    title: "The widow's two small coins",
    summary:
      "He sits opposite the treasury and watches. She put in more than all of them, because she put in everything.",
    quote: "Truly I say to you, this poor widow put in more than all of them;",
    quoteRef: "Luke 21:3",
    refs: ["Mark 12:41-44", "Luke 21:1-4"],
    themes: ["money", "faith"],
    harmony: "widows-offering",
  },
  {
    slug: "teaching-on-the-resurrection",
    kind: "TEACHING",
    title: "On the resurrection",
    summary:
      "The Sadducees bring a riddle about seven brothers. He tells them they know neither the Scriptures nor the power of God.",
    quote:
      "You are mistaken, not understanding the Scriptures nor the power of God.",
    quoteRef: "Matthew 22:29",
    refs: ["Matthew 22:23-33", "Mark 12:18-27", "Luke 20:27-40"],
    themes: ["prophecy", "salvation"],
    harmony: "sadducees-resurrection",
  },
  {
    slug: "teaching-on-the-helper",
    kind: "TEACHING",
    title: "On the Helper who is coming",
    summary:
      "It is to their advantage that He goes away, because then the Spirit of truth will come.",
    quote:
      "But I tell you the truth, it is to your advantage that I go away; for if I do not go away, the Helper will not come to you; but if I go, I will send Him to you.",
    quoteRef: "John 16:7",
    refs: ["John 14:15-31", "John 16:5-15"],
    themes: ["prophecy", "discipleship"],
  },
  {
    slug: "come-to-me-all-who-labour",
    kind: "TEACHING",
    title: "Come to me, all who labour",
    summary:
      "An invitation offering not the removal of a yoke but the exchange of one for an easier one.",
    quote:
      "Come to me, all who labor and are heavy laden, and I will give you rest.",
    quoteRef: "Matthew 11:28",
    refs: ["Matthew 11:25-30"],
    themes: ["salvation", "love"],
  },
  {
    slug: "teaching-on-forgiveness-and-prayer",
    kind: "TEACHING",
    title: "On forgiving before you pray",
    summary:
      "Whenever you stand praying, forgive — He ties the vertical and the horizontal together and will not untie them.",
    quote:
      "Whenever you stand praying, forgive, if you have anything against anyone, so that your Father who is in heaven will also forgive you your transgressions.",
    quoteRef: "Mark 11:25",
    refs: ["Mark 11:25", "Matthew 6:14-15"],
    themes: ["prayer", "love"],
  },
  {
    slug: "teaching-on-hell-and-judgment",
    kind: "TEACHING",
    title: "On judgment and eternal accountability",
    summary:
      "The hardest strand of His teaching: a reckoning is coming, and it is not a metaphor He softens.",
    quote:
      "These will go away into eternal punishment, but the righteous into eternal life.",
    quoteRef: "Matthew 25:46",
    refs: ["Matthew 25:31-46", "Mark 9:42-48", "Luke 12:4-5"],
    themes: ["judgment", "warnings"],
  },

  // ═══ ENCOUNTERS ═════════════════════════════════════════════════════════
  {
    slug: "nicodemus",
    kind: "ENCOUNTER",
    title: "Nicodemus, by night",
    summary:
      "A member of the ruling council comes in the dark with a compliment and leaves with a riddle about birth.",
    refs: ["John 3:1-21", "John 7:50-52", "John 19:38-42"],
    themes: ["salvation", "faith"],
  },
  {
    slug: "the-samaritan-woman",
    kind: "ENCOUNTER",
    title: "The woman at the well",
    summary:
      "Wrong nation, wrong gender, wrong hour, wrong history — and the longest recorded conversation He has with anyone.",
    refs: ["John 4:1-42"],
    themes: ["salvation", "love"],
  },
  {
    slug: "calling-the-first-disciples",
    kind: "ENCOUNTER",
    title: "Calling the first disciples",
    summary:
      "By the Sea of Galilee He interrupts four men mid-livelihood, and immediately they leave the nets.",
    refs: ["Matthew 4:18-22", "Mark 1:16-20", "Luke 5:1-11"],
    themes: ["discipleship"],
    harmony: "call-of-disciples",
  },
  {
    slug: "calling-matthew",
    kind: "ENCOUNTER",
    title: "Calling Matthew from the tax booth",
    summary:
      "He recruits a collaborator, then goes to dinner at his house with all his friends.",
    refs: ["Matthew 9:9-13", "Mark 2:13-17", "Luke 5:27-32"],
    themes: ["salvation", "discipleship"],
    harmony: "call-of-matthew",
  },
  {
    slug: "zacchaeus",
    kind: "ENCOUNTER",
    title: "Zacchaeus in the sycamore tree",
    summary:
      "He invites Himself to lunch at the house of the most hated man in Jericho, and the man gives half his goods away.",
    refs: ["Luke 19:1-10"],
    themes: ["salvation", "money"],
  },
  {
    slug: "the-rich-young-ruler",
    kind: "ENCOUNTER",
    title: "The rich young ruler",
    summary:
      "The only person in the gospels who is invited to follow Him and refuses. Mark notes that Jesus loved him.",
    refs: ["Matthew 19:16-30", "Mark 10:17-31", "Luke 18:18-30"],
    themes: ["money", "discipleship"],
    harmony: "rich-young-ruler",
  },
  {
    slug: "mary-and-martha",
    kind: "ENCOUNTER",
    title: "Mary and Martha",
    summary:
      "One sister is serving, one is sitting. He defends the one who is not being useful.",
    refs: ["Luke 10:38-42"],
    themes: ["discipleship", "love"],
  },
  {
    slug: "the-woman-who-anointed-his-feet",
    kind: "ENCOUNTER",
    title: "The woman who wept on His feet",
    summary:
      "At a Pharisee's dinner, an uninvited woman with a bad reputation and an alabaster flask.",
    refs: ["Luke 7:36-50"],
    themes: ["love", "salvation"],
  },
  {
    slug: "mary-of-bethany-anoints-jesus",
    kind: "ENCOUNTER",
    title: "Mary of Bethany anoints Him for burial",
    summary:
      "A year's wages poured out in a room that smelled of it afterwards, six days before the Passover.",
    refs: ["John 12:1-8", "Matthew 26:6-13", "Mark 14:3-9"],
    themes: ["love", "prophecy"],
    harmony: "bethany-anointing",
  },
  {
    slug: "nathanael-under-the-fig-tree",
    kind: "ENCOUNTER",
    title: "Nathanael under the fig tree",
    summary:
      '"Can anything good come out of Nazareth?" He answers the scepticism by describing where the man had been sitting.',
    refs: ["John 1:43-51"],
    themes: ["faith", "discipleship"],
  },
  {
    slug: "peters-confession",
    kind: "ENCOUNTER",
    title: "Peter's confession at Caesarea Philippi",
    summary:
      "Far north of Galilee, at the foot of a cliff full of pagan shrines, Peter says: You are the Christ.",
    refs: ["Matthew 16:13-20", "Mark 8:27-30", "Luke 9:18-21"],
    themes: ["faith", "kingdom"],
    harmony: "peters-confession",
  },
  {
    slug: "doubting-thomas",
    kind: "ENCOUNTER",
    title: "Thomas and the wounds",
    summary:
      "He returns a week later specifically for the one man who wasn't there, and offers him his hands.",
    refs: ["John 20:24-29"],
    themes: ["faith"],
  },
  {
    slug: "the-road-to-emmaus",
    kind: "ENCOUNTER",
    title: "The road to Emmaus",
    summary:
      "Seven miles of Bible study with a stranger, and they only recognise Him when He breaks the bread.",
    refs: ["Luke 24:13-35"],
    themes: ["prophecy", "faith"],
  },
  {
    slug: "restoring-peter",
    kind: "ENCOUNTER",
    title: "Restoring Peter on the beach",
    summary:
      "Three denials by a charcoal fire, three questions by another charcoal fire.",
    refs: ["John 21:15-19"],
    themes: ["love", "discipleship"],
  },
  {
    slug: "the-thief-on-the-cross",
    kind: "ENCOUNTER",
    title: "The thief on the cross",
    summary:
      "A dying criminal makes the simplest request in the gospels and gets an immediate promise.",
    refs: ["Luke 23:39-43"],
    themes: ["salvation", "faith"],
  },
  {
    slug: "jesus-before-pilate",
    kind: "ENCOUNTER",
    title: "Jesus before Pilate",
    summary:
      "A governor who can find no guilt in Him, a crowd that will not relent, and a question left hanging: what is truth?",
    refs: ["John 18:28-40", "John 19:1-16", "Matthew 27:11-26"],
    themes: ["kingdom", "judgment"],
    harmony: "pilate-trial",
  },
  {
    slug: "the-greeks-who-wished-to-see-jesus",
    kind: "ENCOUNTER",
    title: "The Greeks who wished to see Jesus",
    summary:
      "Outsiders ask for Him, and He answers that the hour has come — a grain of wheat must fall into the earth.",
    refs: ["John 12:20-33"],
    themes: ["salvation", "prophecy"],
  },
  {
    slug: "the-boy-in-the-temple",
    kind: "ENCOUNTER",
    title: "The boy in the temple",
    summary:
      "Twelve years old, missing for three days, found questioning the teachers. His first recorded words are about His Father's house.",
    quote: "Did you not know that I must be in my Father's house?",
    quoteRef: "Luke 2:49",
    refs: ["Luke 2:41-52"],
    themes: ["kingdom", "discipleship"],
  },
  {
    slug: "the-baptism-of-jesus",
    kind: "ENCOUNTER",
    title: "The baptism of Jesus",
    summary:
      "John protests that it should be the other way round. The heavens open and the Father speaks.",
    refs: ["Matthew 3:13-17", "Mark 1:9-11", "Luke 3:21-22"],
    themes: ["kingdom", "prophecy"],
    harmony: "baptism",
  },
  {
    slug: "the-temptation-in-the-wilderness",
    kind: "ENCOUNTER",
    title: "The temptation in the wilderness",
    summary:
      "Forty days, three offers, three answers — every one of them a quotation from Deuteronomy.",
    refs: ["Matthew 4:1-11", "Mark 1:12-13", "Luke 4:1-13"],
    themes: ["faith", "warnings"],
    harmony: "temptation",
  },
  {
    slug: "blessing-the-children",
    kind: "ENCOUNTER",
    title: "Blessing the children",
    summary:
      "Parents bring children, disciples turn them away, and He takes them in His arms.",
    refs: ["Matthew 19:13-15", "Mark 10:13-16", "Luke 18:15-17"],
    themes: ["kingdom", "love"],
    harmony: "blessing-children",
  },
  {
    slug: "the-triumphal-entry",
    kind: "ENCOUNTER",
    title: "The triumphal entry",
    summary:
      "He arranges His own arrival on a borrowed colt, deliberately fulfilling Zechariah in front of everyone.",
    refs: ["Matthew 21:1-11", "Mark 11:1-11", "Luke 19:28-40", "John 12:12-19"],
    themes: ["kingdom", "prophecy"],
    harmony: "triumphal-entry",
  },
  {
    slug: "the-last-supper",
    kind: "ENCOUNTER",
    title: "The Last Supper",
    summary:
      "A Passover meal in a borrowed room, a betrayal announced, and bread and wine given a new meaning.",
    refs: ["Matthew 26:17-30", "Mark 14:12-26", "Luke 22:7-23", "John 13:1-30"],
    themes: ["salvation", "love"],
    harmony: "last-supper",
  },
  {
    slug: "gethsemane",
    kind: "ENCOUNTER",
    title: "Gethsemane",
    summary:
      '"Not as I will, but as you will." He asks three times for the cup to pass, and goes anyway.',
    refs: ["Matthew 26:36-46", "Mark 14:32-42", "Luke 22:39-46"],
    themes: ["prayer", "salvation"],
    harmony: "gethsemane",
  },
  {
    slug: "mary-magdalene-at-the-tomb",
    kind: "ENCOUNTER",
    title: "Mary Magdalene at the tomb",
    summary:
      "The first witness of the resurrection is a woman who mistook Him for the gardener until He said her name.",
    refs: ["John 20:1-18", "Matthew 28:1-10"],
    themes: ["salvation", "love"],
    harmony: "resurrection-morning",
  },
  {
    slug: "the-ascension",
    kind: "ENCOUNTER",
    title: "The Ascension",
    summary:
      "He blesses them, and while blessing them is carried up — with a promise about how He will return.",
    refs: ["Luke 24:50-53", "Mark 16:19", "Acts 1:6-11"],
    themes: ["prophecy", "kingdom"],
  },

  // ═══ COMPASSION ═════════════════════════════════════════════════════════
  {
    slug: "jesus-wept-at-the-tomb",
    kind: "COMPASSION",
    title: "Jesus wept",
    summary:
      "He knew He was about to raise Lazarus. He cried anyway, and the shortest verse in the Bible records it.",
    refs: ["John 11:32-38"],
    themes: ["love"],
  },
  {
    slug: "weeping-over-jerusalem",
    kind: "COMPASSION",
    title: "Weeping over Jerusalem",
    summary:
      "In the middle of a celebration, He looks at the city and grieves what it does not know.",
    refs: ["Luke 19:41-44", "Matthew 23:37-39"],
    themes: ["love", "judgment", "prophecy"],
  },
  {
    slug: "moved-with-compassion-for-the-crowds",
    kind: "COMPASSION",
    title: "Moved with compassion for the crowds",
    summary:
      "He sees them harassed and helpless, like sheep without a shepherd — and tells the disciples to pray for workers.",
    refs: ["Matthew 9:35-38", "Mark 6:34"],
    themes: ["love", "prayer"],
    harmony: "compassion-crowds",
  },
  {
    slug: "touching-the-leper",
    kind: "COMPASSION",
    title: "Touching the untouchable",
    summary:
      "He could have healed with a word, as He did elsewhere. Here He stretched out His hand first.",
    refs: ["Mark 1:40-42", "Matthew 8:1-3"],
    themes: ["love"],
    harmony: "leper-cleansed",
  },
  {
    slug: "forgiving-the-woman-caught-in-adultery",
    kind: "COMPASSION",
    title: "The woman caught in adultery",
    summary:
      "He writes in the dust, disarms a mob with one sentence, and is the only one left with standing to condemn her — and doesn't.",
    refs: ["John 8:1-11"],
    themes: ["love", "salvation"],
  },
  {
    slug: "washing-the-disciples-feet",
    kind: "COMPASSION",
    title: "Washing the disciples' feet",
    summary:
      "Knowing the Father had given all things into His hands, He took a towel — including for the man about to betray Him.",
    refs: ["John 13:1-17"],
    themes: ["love", "discipleship"],
  },
  {
    slug: "father-forgive-them",
    kind: "COMPASSION",
    title: "Father, forgive them",
    summary:
      "His first recorded words from the cross are an intercession for the people driving in the nails.",
    quote: "Father, forgive them, for they know not what they do.",
    quoteRef: "Luke 23:34",
    refs: ["Luke 23:32-38"],
    themes: ["love", "prayer", "salvation"],
  },
  {
    slug: "behold-your-mother",
    kind: "COMPASSION",
    title: "Behold your mother",
    summary:
      "Dying, He arranges His mother's care — a piece of family logistics handled from a cross.",
    refs: ["John 19:25-27"],
    themes: ["love"],
  },
  {
    slug: "eating-with-tax-collectors-and-sinners",
    kind: "COMPASSION",
    title: "Eating with tax collectors and sinners",
    summary:
      'The charge He never denied. "Those who are well have no need of a physician."',
    refs: ["Matthew 9:10-13", "Mark 2:15-17", "Luke 5:29-32", "Luke 15:1-2"],
    themes: ["love", "salvation"],
    harmony: "call-of-matthew",
  },
  {
    slug: "restoring-the-demoniac",
    kind: "COMPASSION",
    title: "Sending the healed man home",
    summary:
      "The man wants to come with Him. Jesus sends him back to the people who had chained him, to tell them.",
    refs: ["Mark 5:15-20"],
    themes: ["love", "discipleship"],
    harmony: "gerasene-demoniac",
  },
  {
    slug: "the-widow-of-nain",
    kind: "COMPASSION",
    title: '"Do not weep"',
    summary:
      "He interrupts a funeral for a woman who has now lost both husband and only son, because He saw her.",
    refs: ["Luke 7:11-17"],
    themes: ["love"],
  },
  {
    slug: "healing-all-who-came",
    // "Many healed at sunset" in the traditional catalogues. Typed COMPASSION
    // when HEALING did not yet exist; it is a bodily restoration like any
    // other, and the re-typing pass only looked at entries already typed
    // MIRACLE, so it was missed. Title and summary are deliberately untouched —
    // see the note on cluster leads at the top of this file.
    kind: "HEALING",
    title: "Healing everyone who came",
    summary:
      "Whole evenings spent at a door, laying hands on each one — the gospels record it almost in passing.",
    refs: ["Luke 4:40-41", "Matthew 8:16-17", "Mark 1:32-34"],
    themes: ["love", "prophecy"],
    harmony: "evening-healings",
  },

  {
    slug: "taking-her-by-the-hand",
    kind: "COMPASSION",
    title: "Taking her by the hand",
    summary:
      "He could have spoken across the room. Mark keeps the detail that He went over, took her hand, and raised her up.",
    refs: ["Mark 1:31", "Matthew 8:15"],
    themes: ["love"],
    harmony: "peters-mother-in-law",
  },
  {
    slug: "taking-the-dead-girl-by-the-hand",
    kind: "COMPASSION",
    title: "Taking the dead girl by the hand",
    summary:
      "Touching a corpse made a man unclean. He takes her hand anyway and speaks to her in the language of a household waking a child.",
    refs: ["Mark 5:41", "Luke 8:54"],
    themes: ["love", "faith"],
    harmony: "jairus-daughter",
  },
  {
    slug: "who-touched-me-daughter",
    kind: "COMPASSION",
    title: '"Daughter" — stopping the crowd to find her',
    summary:
      'She was already healed and could have slipped away. He stops the whole procession to find her, and gives her a word she can keep: not "you are healed" but "Daughter."',
    refs: ["Mark 5:32-34", "Luke 8:47-48"],
    themes: ["love", "faith"],
    harmony: "bleeding-woman",
  },
  {
    slug: "taking-the-children-in-his-arms",
    kind: "COMPASSION",
    title: "Taking the children in His arms",
    summary:
      "The disciples treat them as an interruption. He is indignant, gathers them up, and blesses them with His hands on them.",
    refs: ["Mark 10:16", "Matthew 19:15"],
    themes: ["love", "kingdom"],
    harmony: "blessing-children",
  },
  {
    slug: "stopping-for-bartimaeus",
    kind: "COMPASSION",
    title: "Stopping for a beggar shouting",
    summary:
      "The crowd tells him to be quiet. Jesus hears the one voice being shouted down, stops on the road out of Jericho, and has him called over.",
    refs: ["Mark 10:49", "Luke 18:40"],
    themes: ["love", "faith"],
    harmony: "bartimaeus",
  },
  {
    slug: "he-said-her-name",
    kind: "COMPASSION",
    title: '"Mary"',
    summary:
      "She is weeping at an empty tomb and mistakes Him for the gardener. He does not argue her out of her grief; He says her name, and that is enough.",
    refs: ["John 20:15-16"],
    themes: ["love", "salvation"],
    harmony: "resurrection-morning",
  },

  // ═══ CONFRONTATIONS ═════════════════════════════════════════════════════
  {
    slug: "cleansing-the-temple",
    kind: "CONFRONTATION",
    title: "Cleansing the temple",
    summary:
      "A whip of cords, overturned tables, and a quotation about a house of prayer becoming a den of robbers.",
    refs: [
      "Matthew 21:12-17",
      "Mark 11:15-19",
      "Luke 19:45-48",
      "John 2:13-22",
    ],
    themes: ["judgment", "prayer"],
    harmony: "temple-cleansing",
  },
  {
    slug: "woes-to-the-pharisees",
    kind: "CONFRONTATION",
    title: "Woe to you, scribes and Pharisees",
    summary:
      "Seven woes delivered in the temple courts — whitewashed tombs, strained gnats, swallowed camels.",
    refs: ["Matthew 23:1-39", "Luke 11:37-54"],
    themes: ["warnings", "judgment"],
    harmony: "seven-woes",
  },
  {
    slug: "the-sabbath-healing-controversy",
    kind: "CONFRONTATION",
    title: "The Sabbath healing controversy",
    summary:
      "They watch to accuse Him. He asks whether it is lawful to do good on the Sabbath, and heals in front of them.",
    refs: ["Mark 3:1-6"],
    themes: ["warnings", "love"],
    harmony: "withered-hand",
  },
  {
    slug: "the-tradition-of-the-elders",
    kind: "CONFRONTATION",
    title: "The tradition of the elders",
    summary:
      "Challenged about unwashed hands, He accuses them of using tradition to nullify the commandment of God.",
    refs: ["Matthew 15:1-20", "Mark 7:1-23"],
    themes: ["warnings"],
    harmony: "defilement-teaching",
  },
  {
    slug: "the-beelzebul-accusation",
    kind: "CONFRONTATION",
    title: "The Beelzebul accusation",
    summary:
      "Accused of casting out demons by the prince of demons, He points out that a divided kingdom cannot stand.",
    refs: ["Matthew 12:22-32", "Mark 3:20-30", "Luke 11:14-23"],
    themes: ["kingdom", "warnings"],
    harmony: "beelzebul",
  },
  // The healing that provoked the accusation above, and one of the traditional
  // catalogue's 37. Filed here rather than with the miracles because it joins
  // an existing cluster: see the note on cluster leads at the top of this file.
  {
    slug: "healing-the-blind-and-mute-demoniac",
    kind: "HEALING",
    title: "The blind and mute demoniac",
    summary:
      "A man who can neither see nor speak is brought to Him and leaves doing both. The crowd asks whether this could be the Son of David — and the accusation follows.",
    refs: ["Matthew 12:22-23", "Luke 11:14"],
    themes: ["kingdom", "faith"],
    harmony: "beelzebul",
  },
  {
    slug: "the-demand-for-a-sign",
    kind: "CONFRONTATION",
    title: "The demand for a sign",
    summary:
      "They want proof. He sighs deeply and says no sign will be given except the sign of Jonah.",
    refs: ["Matthew 12:38-42", "Matthew 16:1-4", "Mark 8:11-13"],
    themes: ["warnings", "prophecy"],
    harmony: "sign-of-jonah",
  },
  {
    slug: "you-are-of-your-father-the-devil",
    kind: "CONFRONTATION",
    title: '"If God were your Father…"',
    summary:
      "The sharpest exchange in the gospels, over descent from Abraham and who is actually doing whose works.",
    refs: ["John 8:31-47"],
    themes: ["warnings", "judgment"],
  },
  {
    slug: "by-what-authority",
    kind: "CONFRONTATION",
    title: "By what authority are you doing these things?",
    summary:
      "He answers a question with a question about John's baptism, and they refuse to answer it.",
    refs: ["Matthew 21:23-27", "Mark 11:27-33", "Luke 20:1-8"],
    themes: ["kingdom"],
    harmony: "authority-question",
  },
  {
    slug: "get-behind-me-satan",
    kind: "CONFRONTATION",
    title: "Get behind me, Satan",
    summary:
      "Minutes after Peter's great confession, Peter tries to talk Him out of the cross and is rebuked by name.",
    refs: ["Matthew 16:21-23", "Mark 8:31-33"],
    themes: ["warnings", "discipleship"],
    harmony: "peter-rebuked",
  },
  {
    slug: "woe-to-the-unrepentant-cities",
    kind: "CONFRONTATION",
    title: "Woe to Chorazin and Bethsaida",
    summary:
      "He names the towns that saw the most and repented least, and compares them unfavourably to Sodom.",
    refs: ["Matthew 11:20-24", "Luke 10:13-15"],
    themes: ["judgment", "warnings"],
    harmony: "woe-to-cities",
  },
  {
    slug: "the-plot-to-kill-him",
    kind: "CONFRONTATION",
    title: "The plot to kill Him",
    summary:
      "Raising Lazarus is what finally decides them. The council reasons that it is expedient for one man to die for the people — and from that day they plan His death.",
    refs: ["John 11:45-53"],
    themes: ["judgment", "salvation"],
  },
  {
    slug: "refusing-every-shortcut",
    kind: "CONFRONTATION",
    title: "Refusing every shortcut",
    summary:
      "Bread, spectacle, and the kingdoms of the world without a cross. He answers each one from Deuteronomy and takes none of them.",
    refs: ["Matthew 4:1-11", "Luke 4:1-13"],
    themes: ["kingdom", "faith"],
    harmony: "temptation",
  },
  {
    slug: "which-is-easier-to-say",
    kind: "CONFRONTATION",
    title: "Refusing to soften the claim to forgive",
    summary:
      "They are right that only God forgives sins. Rather than retreat from what He said, He heals the man in front of them to prove He had the right to say it.",
    refs: ["Mark 2:6-12", "Luke 5:21-25"],
    themes: ["salvation", "kingdom"],
    harmony: "paralytic-roof",
  },
  {
    slug: "you-would-have-no-authority",
    kind: "CONFRONTATION",
    title: "Telling Pilate where his authority comes from",
    summary:
      "Pilate says he has power to release or crucify Him. Jesus, bound and beaten, tells him he would have none at all unless it had been given from above.",
    refs: ["John 19:10-11"],
    themes: ["kingdom", "judgment"],
    harmony: "pilate-trial",
  },
  {
    slug: "the-trial-before-the-sanhedrin",
    kind: "CONFRONTATION",
    title: "The trial before the Sanhedrin",
    summary:
      "Contradictory witnesses, a silent defendant, and one question He finally answers.",
    refs: ["Matthew 26:57-68", "Mark 14:53-65", "Luke 22:66-71"],
    themes: ["judgment", "prophecy"],
    harmony: "sanhedrin-trial",
  },
  {
    slug: "the-rejection-at-nazareth",
    kind: "CONFRONTATION",
    title: "The rejection at Nazareth",
    summary:
      "He reads Isaiah in His hometown synagogue, says it is fulfilled today, and they try to throw Him off a cliff.",
    refs: ["Luke 4:16-30", "Matthew 13:53-58", "Mark 6:1-6"],
    themes: ["prophecy", "warnings"],
    harmony: "nazareth-rejection",
  },
  {
    slug: "the-sadducees-on-the-resurrection",
    kind: "CONFRONTATION",
    title: "The Sadducees' riddle",
    summary:
      "Seven brothers, one wife, and a trap. He says God is the God of the living, not the dead.",
    refs: ["Matthew 22:23-33", "Mark 12:18-27", "Luke 20:27-40"],
    themes: ["prophecy", "warnings"],
    harmony: "sadducees-resurrection",
  },
  {
    slug: "the-question-about-taxes",
    kind: "CONFRONTATION",
    title: "The question about paying taxes",
    summary:
      "Pharisees and Herodians — natural enemies — cooperate to trap Him, and He escapes with a coin.",
    refs: ["Matthew 22:15-22", "Mark 12:13-17", "Luke 20:20-26"],
    themes: ["money", "kingdom"],
    harmony: "taxes-to-caesar",
  },
];

// ── The chronological walk ────────────────────────────────────────────────

/**
 * "Follow His Life" — an ordered list of entry slugs per period.
 *
 * Kept separate from the entries because chronology is a curation decision
 * that cuts across kinds. The seeder assigns `period_id` and
 * `chronology_order` from this list and throws on an unknown slug, so a typo
 * fails the seed rather than silently vanishing from the timeline.
 *
 * Not every entry appears here — a saying with no fixed setting (the Golden
 * Rule, say) belongs to a topic, not to a moment.
 */
export const LIFE_TIMELINE: Record<string, string[]> = {
  "hidden-years": ["the-boy-in-the-temple"],
  preparation: [
    "the-baptism-of-jesus",
    "the-temptation-in-the-wilderness",
    "refusing-every-shortcut",
  ],
  "early-ministry": [
    "what-are-you-seeking",
    "nathanael-under-the-fig-tree",
    "water-into-wine",
    "cleansing-the-temple",
    "nicodemus",
    "you-must-be-born-again",
    "the-samaritan-woman",
    "living-water",
    "i-who-speak-to-you-am-he",
    "healing-the-officials-son",
  ],
  "galilean-ministry": [
    "the-rejection-at-nazareth",
    "repent-for-the-kingdom-is-at-hand",
    "calling-the-first-disciples",
    "follow-me",
    "unclean-spirit-in-capernaum",
    "healing-peters-mother-in-law",
    "taking-her-by-the-hand",
    "healing-all-who-came",
    "miraculous-catch-of-fish",
    "cleansing-a-leper",
    "touching-the-leper",
    "healing-the-paralytic",
    "which-is-easier-to-say",
    "calling-matthew",
    "eating-with-tax-collectors-and-sinners",
    "parable-of-new-wine-and-old-wineskins",
    "healing-at-bethesda",
    "do-you-want-to-be-healed",
    "teaching-on-the-sabbath",
    "lord-of-the-sabbath",
    "greater-than-the-temple",
    "healing-the-withered-hand",
    "the-sabbath-healing-controversy",
    "the-beatitudes",
    "i-came-to-fulfil-the-law",
    "salt-and-light",
    "let-your-light-shine",
    "teaching-on-anger",
    "teaching-on-lust",
    "teaching-on-oaths",
    "teaching-on-retaliation",
    "give-to-the-one-who-asks",
    "love-your-enemies",
    "teaching-on-giving",
    "teaching-on-prayer",
    "pray-like-this",
    "teaching-on-fasting",
    "treasures-in-heaven",
    "do-not-be-anxious",
    "which-of-you-by-being-anxious",
    "seek-first-the-kingdom",
    "do-not-judge",
    "why-do-you-see-the-speck",
    "ask-seek-knock",
    "the-golden-rule",
    "enter-through-the-narrow-gate",
    "a-tree-and-its-fruit",
    "parable-of-the-wise-and-foolish-builders",
    "healing-the-centurions-servant",
    "raising-the-widows-son-at-nain",
    "the-widow-of-nain",
    "come-to-me-all-who-labour",
    "woe-to-the-unrepentant-cities",
    "the-woman-who-anointed-his-feet",
    "parable-of-the-two-debtors",
    "healing-the-blind-and-mute-demoniac",
    "the-beelzebul-accusation",
    "the-demand-for-a-sign",
    "who-is-my-mother-and-my-brothers",
    "parable-of-the-sower",
    "parable-of-the-lamp-under-a-basket",
    "parable-of-the-growing-seed",
    "parable-of-the-weeds",
    "parable-of-the-mustard-seed",
    "parable-of-the-leaven",
    "parable-of-the-hidden-treasure",
    "parable-of-the-pearl",
    "parable-of-the-net",
    "calming-the-storm",
    "why-are-you-afraid",
    "where-is-your-faith",
    "healing-the-gerasene-demoniac",
    "restoring-the-demoniac",
    "healing-the-bleeding-woman",
    "who-touched-my-garments",
    "who-touched-me-daughter",
    "raising-jairus-daughter",
    "taking-the-dead-girl-by-the-hand",
    "healing-two-blind-men",
    "do-you-believe-that-i-am-able",
    "healing-a-mute-demoniac",
    "moved-with-compassion-for-the-crowds",
    "feeding-the-five-thousand",
    "how-many-loaves-do-you-have",
    "walking-on-water",
    "healing-many-at-gennesaret",
    "the-bread-of-life-discourse",
    "i-am-the-bread-of-life",
    "the-tradition-of-the-elders",
    "what-defiles-a-person",
    "healing-the-syrophoenician-womans-daughter",
    "healing-a-deaf-and-mute-man",
    "feeding-the-four-thousand",
    "healing-a-blind-man-at-bethsaida",
    "do-you-not-yet-understand",
    "beware-the-leaven-of-the-pharisees",
  ],
  "turning-point": [
    "peters-confession",
    "who-do-you-say-that-i-am",
    "the-son-of-man-must-suffer",
    "get-behind-me-satan",
    "take-up-your-cross",
    "what-does-it-profit-to-gain-the-world",
    "the-transfiguration",
    "healing-the-boy-with-an-unclean-spirit",
    "the-coin-in-the-fish",
    "forgive-seventy-times-seven",
    "parable-of-the-unforgiving-servant",
    "parable-of-the-lost-sheep",
  ],
  "journey-to-jerusalem": [
    "teaching-on-forgiveness-and-prayer",
    "what-is-written-in-the-law",
    "parable-of-the-good-samaritan",
    "which-proved-to-be-a-neighbour",
    "mary-and-martha",
    "parable-of-the-friend-at-midnight",
    "parable-of-the-rich-fool",
    "parable-of-the-watchful-servants",
    "parable-of-the-faithful-steward",
    "parable-of-the-barren-fig-tree",
    "healing-the-crippled-woman",
    "healing-a-man-with-dropsy",
    "parable-of-the-great-banquet",
    "teaching-on-the-cost-of-discipleship",
    "parable-of-the-tower-and-the-king",
    "parable-of-the-lost-coin",
    "parable-of-the-prodigal-son",
    "parable-of-the-shrewd-manager",
    "parable-of-the-rich-man-and-lazarus",
    "parable-of-the-unworthy-servants",
    "cleansing-ten-lepers",
    "where-are-the-nine",
    "parable-of-the-persistent-widow",
    "parable-of-the-pharisee-and-tax-collector",
    "teaching-on-divorce-and-marriage",
    "blessing-the-children",
    "taking-the-children-in-his-arms",
    "let-the-children-come",
    "the-rich-young-ruler",
    "why-do-you-call-me-good",
    "sell-what-you-have-and-give",
    "parable-of-the-workers-in-the-vineyard",
    "teaching-on-greatness",
    "what-do-you-want-me-to-do-for-you",
    "healing-blind-bartimaeus",
    "stopping-for-bartimaeus",
    "zacchaeus",
    "to-seek-and-save-the-lost",
    "parable-of-the-minas",
    "why-do-you-seek-to-kill-me",
    "forgiving-the-woman-caught-in-adultery",
    "go-and-sin-no-more",
    "i-am-the-light-of-the-world",
    "before-abraham-was-i-am",
    "you-are-of-your-father-the-devil",
    "healing-the-man-born-blind",
    "do-you-believe-in-the-son-of-man",
    "parable-of-the-good-shepherd",
    "i-came-that-they-may-have-life",
    "i-am-the-door",
    "i-am-the-good-shepherd",
    "the-good-shepherd-discourse",
    "i-and-the-father-are-one",
    "raising-lazarus",
    "jesus-wept-at-the-tomb",
    "the-plot-to-kill-him",
    "i-am-the-resurrection-and-the-life",
  ],
  "passion-week": [
    "mary-of-bethany-anoints-jesus",
    "the-triumphal-entry",
    "weeping-over-jerusalem",
    "withering-the-fig-tree",
    "by-what-authority",
    "parable-of-the-two-sons",
    "parable-of-the-wicked-tenants",
    "parable-of-the-wedding-feast",
    "the-question-about-taxes",
    "whose-likeness-and-inscription",
    "render-to-caesar",
    "the-sadducees-on-the-resurrection",
    "teaching-on-the-resurrection",
    "the-greatest-commandment",
    "woes-to-the-pharisees",
    "the-widows-offering",
    "the-greeks-who-wished-to-see-jesus",
    "the-olivet-discourse",
    "parable-of-the-fig-tree-in-leaf",
    "stay-awake",
    "parable-of-the-ten-virgins",
    "parable-of-the-talents",
    "parable-of-the-sheep-and-the-goats",
    "teaching-on-hell-and-judgment",
    "the-last-supper",
    "washing-the-disciples-feet",
    "do-this-in-remembrance-of-me",
    "love-one-another",
    "let-not-your-hearts-be-troubled",
    "i-am-the-way-the-truth-and-the-life",
    "whoever-has-seen-me-has-seen-the-father",
    "teaching-on-the-helper",
    "i-am-the-true-vine",
    "abide-in-me",
    "parable-of-the-vine-and-branches",
    "the-upper-room-discourse",
    "the-high-priestly-prayer",
  ],
  cross: [
    "gethsemane",
    "could-you-not-watch-one-hour",
    "watch-and-pray",
    "whom-are-you-seeking",
    "healing-the-servants-ear",
    "the-trial-before-the-sanhedrin",
    "i-am-before-the-high-priest",
    "jesus-before-pilate",
    "my-kingdom-is-not-of-this-world",
    "you-would-have-no-authority",
    "father-forgive-them",
    "the-thief-on-the-cross",
    "behold-your-mother",
    "my-god-why-have-you-forsaken-me",
  ],
  resurrection: [
    "mary-magdalene-at-the-tomb",
    "woman-why-are-you-weeping",
    "he-said-her-name",
    "the-road-to-emmaus",
    "doubting-thomas",
    "the-second-catch-of-fish",
    "restoring-peter",
    "do-you-love-me",
    "feed-my-sheep",
    "make-disciples-of-all-nations",
    "all-authority-has-been-given-to-me",
    "the-ascension",
  ],
};

// ── Popular Studies ───────────────────────────────────────────────────────

export const JESUS_COLLECTIONS: SeedCollection[] = [
  {
    slug: "the-i-am-statements",
    name: "The I AM statements",
    subtitle: "Eight claims that got Him killed",
    description:
      'Seven metaphors and one bare declaration. Read together, John\'s "I am" sayings are the clearest self-portrait Jesus ever gave — and the reason the religious leaders reached for stones.',
    isFeatured: true,
    members: [
      "i-am-the-bread-of-life",
      "i-am-the-light-of-the-world",
      "i-am-the-door",
      "i-am-the-good-shepherd",
      "i-am-the-resurrection-and-the-life",
      "i-am-the-way-the-truth-and-the-life",
      "i-am-the-true-vine",
      "before-abraham-was-i-am",
    ],
  },
  {
    slug: "every-question-jesus-asked",
    name: "Every question Jesus asked",
    subtitle: "He asked far more than He answered",
    description:
      "Jesus is asked roughly 180 questions in the gospels and answers a handful of them directly. He asks over 300. This study walks through them — because the questions are the teaching.",
    isFeatured: true,
    filter: { kind: "QUESTION" },
  },
  {
    slug: "every-miracle-of-jesus",
    name: "Every miracle of Jesus",
    subtitle: "Signs of a Kingdom breaking in",
    description:
      'Healings, exorcisms, provision, power over nature, and three people raised from the dead — every recorded miracle, with its parallel accounts held together. Lists of these run to 33, 35, 37 or 40; the spread is a counting question, not a doctrinal one. "He healed many" is one line and an unknown number of miracles, and John closes by saying the world could not contain the books.',
    isFeatured: true,
    // Both action kinds, or the study is a third of its own name: the corpus
    // splits a sign over nature from a sign over a body, and "every miracle"
    // means both.
    filter: { kinds: ["MIRACLE", "HEALING"] },
  },
  {
    slug: "what-the-miracles-reveal",
    name: "What the miracles reveal",
    subtitle: "Eight signs, and the claim each one makes",
    description:
      "The pattern matters more than the count. Taken together the signs stop being a list of wonders and start making one claim: authority over disease (the evening at Peter's door), over demons (the Gerasene), over nature (the stilled squall), over scarcity (five loaves), over what was broken from birth (the man born blind), over death (Lazarus) and — the one the crowd found hardest — over sin (the paralytic, forgiven before he was healed). The eighth is not like the other seven. Lazarus was raised and died again; the resurrection is not a reversal of death but the defeat of it, and John says he chose which signs to record so that you would believe exactly that.",
    isFeatured: true,
    // Ordered by the authority each sign demonstrates rather than by
    // chronology. Both list paths sort by period and sequence, so the study
    // currently renders in gospel order and the progression has to be carried
    // by the description above; curated order is not honoured anywhere yet.
    members: [
      "healing-all-who-came",
      "healing-the-gerasene-demoniac",
      "calming-the-storm",
      "feeding-the-five-thousand",
      "healing-the-man-born-blind",
      "raising-lazarus",
      "healing-the-paralytic",
      "mary-magdalene-at-the-tomb",
    ],
  },
  {
    slug: "every-parable-of-jesus",
    name: "Every parable of Jesus",
    subtitle: "The stories He told instead of arguing",
    description:
      "Forty stories about soil, seeds, sons, servants, feasts and money — told to crowds who thought they were being entertained.",
    isFeatured: true,
    filter: { kind: "PARABLE" },
  },
  {
    slug: "jesus-and-the-pharisees",
    name: "Jesus and the Pharisees",
    subtitle: "Where He refused to back down",
    description:
      "The running conflict that shapes the whole ministry: Sabbath, ritual, authority, taxes, and finally a trial. The most religious people in the room consistently got Him most wrong.",
    isFeatured: true,
    members: [
      "healing-the-withered-hand",
      "the-sabbath-healing-controversy",
      "teaching-on-the-sabbath",
      "lord-of-the-sabbath",
      "the-beelzebul-accusation",
      "the-demand-for-a-sign",
      "the-tradition-of-the-elders",
      "what-defiles-a-person",
      "beware-the-leaven-of-the-pharisees",
      "parable-of-the-pharisee-and-tax-collector",
      "you-are-of-your-father-the-devil",
      "by-what-authority",
      "the-question-about-taxes",
      "woes-to-the-pharisees",
      "the-trial-before-the-sanhedrin",
    ],
  },
  {
    slug: "jesus-and-outsiders",
    name: "Jesus and outsiders",
    subtitle: "Who He went out of His way for",
    description:
      "A Roman officer, a Samaritan woman, a Syrophoenician mother, lepers, tax collectors, a criminal on a cross. The pattern is hard to miss once you look for it.",
    isFeatured: true,
    members: [
      "healing-the-centurions-servant",
      "the-samaritan-woman",
      "healing-the-syrophoenician-womans-daughter",
      "healing-the-gerasene-demoniac",
      "cleansing-a-leper",
      "cleansing-ten-lepers",
      "calling-matthew",
      "eating-with-tax-collectors-and-sinners",
      "zacchaeus",
      "parable-of-the-good-samaritan",
      "the-woman-who-anointed-his-feet",
      "forgiving-the-woman-caught-in-adultery",
      "the-thief-on-the-cross",
      "the-greeks-who-wished-to-see-jesus",
    ],
  },
  {
    slug: "what-he-said-about-god",
    name: "What He said about God",
    subtitle: "The Father, in His own words",
    description:
      "Jesus talks about His Father constantly — as one who feeds birds, runs to meet returning sons, knows what you need before you ask, and can be seen by looking at Him.",
    isFeatured: true,
    members: [
      "pray-like-this",
      "teaching-on-prayer",
      "ask-seek-knock",
      "do-not-be-anxious",
      "parable-of-the-prodigal-son",
      "love-your-enemies",
      "whoever-has-seen-me-has-seen-the-father",
      "i-and-the-father-are-one",
      "the-high-priestly-prayer",
      "let-not-your-hearts-be-troubled",
      "why-do-you-call-me-good",
      "teaching-on-the-resurrection",
    ],
  },
  {
    slug: "the-sermon-on-the-mount",
    name: "The Sermon on the Mount",
    subtitle: "Matthew 5–7, in order",
    description:
      "The longest continuous block of His teaching, walked through from the Beatitudes to the two builders.",
    isFeatured: false,
    members: [
      "the-beatitudes",
      "salt-and-light",
      "let-your-light-shine",
      "i-came-to-fulfil-the-law",
      "teaching-on-anger",
      "teaching-on-lust",
      "teaching-on-divorce-and-marriage",
      "teaching-on-oaths",
      "teaching-on-retaliation",
      "love-your-enemies",
      "teaching-on-giving",
      "teaching-on-prayer",
      "pray-like-this",
      "teaching-on-fasting",
      "treasures-in-heaven",
      "do-not-be-anxious",
      "seek-first-the-kingdom",
      "do-not-judge",
      "ask-seek-knock",
      "the-golden-rule",
      "enter-through-the-narrow-gate",
      "a-tree-and-its-fruit",
      "parable-of-the-wise-and-foolish-builders",
    ],
  },
  {
    slug: "the-last-week",
    name: "The last week",
    subtitle: "Palm Sunday to the empty tomb",
    description:
      "The gospels give roughly a third of their length to seven days. This study follows them in order.",
    isFeatured: false,
    members: [
      "the-triumphal-entry",
      "weeping-over-jerusalem",
      "cleansing-the-temple",
      "withering-the-fig-tree",
      "by-what-authority",
      "the-question-about-taxes",
      "the-greatest-commandment",
      "woes-to-the-pharisees",
      "the-widows-offering",
      "the-olivet-discourse",
      "the-last-supper",
      "washing-the-disciples-feet",
      "do-this-in-remembrance-of-me",
      "the-upper-room-discourse",
      "the-high-priestly-prayer",
      "gethsemane",
      "the-trial-before-the-sanhedrin",
      "jesus-before-pilate",
      "father-forgive-them",
      "the-thief-on-the-cross",
      "my-god-why-have-you-forsaken-me",
      "mary-magdalene-at-the-tomb",
      "the-road-to-emmaus",
    ],
  },
];
