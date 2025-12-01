// Mock data for book introductions
// TODO: Replace with API calls once backend is ready

export interface BookIntroduction {
  bookId: number;
  author: string;
  dateWritten: string;
  biblicalRole: string;
  keyThemes: string[];
  relatedBooks: string;
  literaryStyle: string;
  fullIntroText: string;
}

export const mockBookIntroductions: Record<number, BookIntroduction> = {
  1: {
    bookId: 1,
    author: "Moses",
    dateWritten: "Approximately 1450-1400 BC",
    biblicalRole:
      "Genesis serves as the foundation of the entire biblical narrative, explaining the origins of the world, humanity, sin, and God's covenant relationship with His people. It sets the stage for the story of redemption that unfolds throughout Scripture.",
    keyThemes: [
      "Creation and the nature of God",
      "The Fall and the problem of sin",
      "God's covenant promises",
      "Faith and obedience",
      "God's sovereignty in human history",
    ],
    relatedBooks:
      "Genesis is the first book of the Pentateuch (Genesis-Deuteronomy) and is followed by Exodus, which continues the story of Israel's deliverance from Egypt. The themes introduced here echo throughout the Old and New Testaments.",
    literaryStyle:
      "Genesis combines narrative prose with genealogies, using literary techniques like symmetry, repetition, and dramatic dialogue. It includes both primeval history (chapters 1-11) and patriarchal narratives (chapters 12-50).",
    fullIntroText: `# Introduction to Genesis (Old Testament)

Genesis combines narrative prose with genealogies, using literary techniques like symmetry, repetition, and dramatic dialogue. It includes both primeval history (chapters 1-11) and patriarchal narratives (chapters 12-50).

## Author and Date

Moses is traditionally recognized as the author of Genesis, written during Israel's wilderness journey around 1450-1400 BC. While Moses compiled and shaped the material, it likely draws from earlier oral traditions and written sources passed down through the patriarchs.

## The Book's Role in Scripture

Genesis serves as the foundation of the entire biblical narrative. The name "Genesis" comes from the Greek word meaning "origin" or "beginning," and the book lives up to its name by explaining the origins of the world, humanity, sin, and God's covenant relationship with His people. Everything that follows in Scripture builds upon the theological and historical framework established here.

## Key Themes and Keywords

- **Creation and the nature of God**: God as sovereign Creator who brings order from chaos
- **The Fall and the problem of sin**: Humanity's rebellion and its devastating consequences
- **God's covenant promises**: The foundational promise to Abraham that shapes all of salvation history
- **Faith and obedience**: The pattern of trusting God's promises despite circumstances
- **God's sovereignty in human history**: Divine providence working through human choices

## Related Books

Genesis is the first of five books written by Moses, collectively called the Pentateuch or Torah. Exodus immediately follows, narrating Israel's deliverance from Egyptian slavery—a direct continuation of the story that ends with Joseph's death in Egypt. The promises made to Abraham, Isaac, and Jacob in Genesis become the driving force behind God's actions in Exodus and beyond. Themes introduced in Genesis—creation, fall, promise, and redemption—echo throughout both Old and New Testaments, culminating in Christ.`,
  },
};

// Helper function to get intro by book ID
export function getBookIntroduction(
  bookId: number,
): BookIntroduction | undefined {
  return mockBookIntroductions[bookId];
}
