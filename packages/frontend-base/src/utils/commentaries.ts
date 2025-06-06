interface Subtitle {
  title: string;
  text: string;
}

interface Commentary {
  title: string;
  subtitles?: Subtitle[];
  text?: string;
}

export const commentaries: Commentary[] = [
  {
    title: "Explanation of Matthew 22:1-14 - The Parable of the Wedding Feast",
    subtitles: [
      {
        title: "Summary of the Parable",
        text: `The Parable of the Wedding Feast in Matthew 22:1-14 tells a story of a king who hosts a wedding feast for his son. He sends his servants out to invite selected guests, but they refuse to come. After a second invitation is also ignored, with some guests going as far as mistreating and killing the messengers, the king becomes enraged and punishes those murderers by destroying their city.
Subsequently, the king instructs his servants to invite everyone they can find, leading to the wedding hall being filled with guests. However, upon noticing a guest not dressed in wedding clothes, the king queries him and, getting no response, orders the servants to cast him out into the darkness. The parable concludes with the poignant line, "For many are called, but few are chosen."`,
      },
    ],
  },
  {
    title: "Analysis and Interpretation",
    subtitles: [
      {
        title: "Themes of Judgment and Mercy",
        text: "This parable, like many of Christ's teachings, juxtaposes judgment and mercy. Initially, there's the king's generous invitation, which reflects divine mercy. However, the rejection of this invitation results in severe judgment. The narrative emphasizes God's initial patience but eventual harsh response to outright rejection and disrespect toward His call.",
      },
      {
        title: "The Call to All",
        text: "Notably, the second round of invitations is non-discriminatory; the king's servants gather all, irrespective of status or morality. This symbolizes the universal call to salvation extending beyond traditional bounds (in this context, beyond the Jewish people to the Gentiles). The parable indicates that the kingdom of heaven is open to all who accept the invitation and adhere to its requisites.",
      },
      {
        title: "Symbolism of Wedding Garments",
        text: "The guest without wedding clothes is significant. The wedding garment symbolizes righteousness and salvation, requirements for participation in the kingdom of God. The absence of proper attire signifies unpreparedness and disregard for the sanctity of the occasion. This aspect of the parable underscores the seriousness with which one must approach divine invitation; it is not enough to simply show up, one must also be transformed and prepared.",
      },
    ],
  },
  {
    title: "Application and Significance to the Reader",
    subtitles: [
      {
        title: "Reflection on Reception of the Divine Call",
        text: "This parable urges readers to reflect on their response to God’s invitation. It suggests that ignoring or rejecting this call can lead to severe consequences. It also encourages readers to consider their preparedness and willingness to partake in the kingdom of God, emphasizing the necessity of spiritual transformation and readiness.",
      },
      {
        title: `Universal Reach of God's Call`,
        text: `The indiscriminate invitation portrays a powerful message of inclusion and the comprehensive reach of God’s grace. It challenges readers to embrace a universal vision of God’s kingdom, recognizing that it is open to everyone, irrespective of their past or present, as long as they come prepared in the 'right garments.'`,
      },
      {
        title: "Person Examination of Spiritual Preparedness",
        text: `Finally, the motif of the wedding garment invites readers to examine their spiritual state. It raises questions about authenticity and genuineness in one's spiritual life. Just as the improperly dressed guest was cast out, this serves as a metaphor for spiritual preparedness and the critical nature of aligning one’s life with God’s expectations.`,
      },
    ],
  },
  {
    title: "Conlusion",
    text: "The Parable of the Wedding Feast is a rich and multilayered teaching that speaks to both the graciousness of God’s invitations to mankind and the serious requirements of accepting such an invitation. It challenges believers to consider their own reception to God's call, their inclusivity towards others, and their personal spiritual state. This reflection is crucial for anyone seeking to understand their place in the realm of the divine and their preparation for the eternal banquet promised to those who respond rightly to the call of God.",
  },
];
