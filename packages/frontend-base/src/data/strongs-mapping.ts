export const wordToStrongs: Record<string, string> = {
  love: "G26",
  god: "G2316",
  word: "G3056",
  light: "G5457",
  life: "G2222",
  truth: "G225",
  faith: "G4102",
  grace: "G5485",
  peace: "G1515",
  spirit: "G4151",
  christ: "G5547",
  jesus: "G2424",
  lord: "G2962",
  father: "G3962",
  son: "G5207",
  holy: "G40",
  church: "G1577",
  salvation: "G4991",
  heaven: "G3772",
  kingdom: "G932",
  gospel: "G2098",
  sin: "G266",
  glory: "G1391",
  power: "G1411",
  wisdom: "G4678",
  hope: "G1680",
  heart: "G2588",
  pray: "G4336",
  prayer: "G4335",
  believe: "G4100",
  righteous: "G1342",
  eternal: "G166",
  elohim: "H430",
  yahweh: "H3068",
  adonai: "H136",
  shalom: "H7965",
  hesed: "H2617",
  ruach: "H7307",
  torah: "H8451",
  nephesh: "H5315",
  lev: "H3820",
  shamayim: "H8064",
  create: "H1254",
  created: "H1254",
  beginning: "H7225",
  heavens: "H8064",
  blessed: "H1288",
  covenant: "H1285",
};

export function normalizeWord(word: string): string {
  return word.toLowerCase().replace(/[.,;:!?'"()]/g, "");
}

export function getStrongsNumber(word: string): string | null {
  const normalized = normalizeWord(word);
  return wordToStrongs[normalized] || null;
}

export function hasStrongsNumber(word: string): boolean {
  return getStrongsNumber(word) !== null;
}
