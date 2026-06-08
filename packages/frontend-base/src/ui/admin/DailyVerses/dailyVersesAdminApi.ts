import { api } from "backend-api";

export interface DailyVerseTag {
  id: string;
  slug: string;
  label: string;
  is_active: boolean;
}

export interface DailyVerse {
  id: string;
  book_id: number;
  chapter_number: number;
  verse_start: number;
  verse_end: number | null;
  note: string | null;
  is_active: boolean;
  tags: { id: string; slug: string; label: string }[];
}

export interface DailyVerseHistoryRow {
  id: string;
  pick_date: string;
  daily_verse_id: string;
  book_id: number;
  chapter_number: number;
  verse_start: number;
  verse_end: number | null;
}

export interface DailyVerseInput {
  book_id: number;
  chapter_number: number;
  verse_start: number;
  verse_end: number | null;
  note: string | null;
  is_active: boolean;
  tag_ids: string[];
}

// Eden Treaty accesses hyphenated route segments via bracket notation. Admin
// endpoints are loosely typed (`as any`) to match the existing TopicsAdmin
// pattern and avoid coupling to the generated App type's exact shape.
const adminApi = () => api.admin as any;

export const getDailyVerses = async (
  activeOnly = false,
): Promise<DailyVerse[]> => {
  const response = await adminApi()["daily-verses"].get({
    query: { active: activeOnly ? "true" : undefined, limit: "200" },
  });
  return response.data?.items ?? [];
};

export const createDailyVerse = async (
  input: DailyVerseInput,
): Promise<DailyVerse> => {
  const response = await adminApi()["daily-verses"].post(input);
  return response.data?.verse;
};

export const updateDailyVerse = async (
  id: string,
  input: DailyVerseInput,
): Promise<DailyVerse> => {
  const response = await adminApi()["daily-verses"][id].put(input);
  return response.data?.verse;
};

export const deleteDailyVerse = async (id: string): Promise<void> => {
  await adminApi()["daily-verses"][id].delete();
};

export const getDailyVerseHistory = async (): Promise<
  DailyVerseHistoryRow[]
> => {
  const response = await adminApi()["daily-verses"].history.get({
    query: { limit: "50" },
  });
  return response.data?.history ?? [];
};

export const getDailyVerseTags = async (): Promise<DailyVerseTag[]> => {
  const response = await adminApi()["daily-verse-tags"].get();
  return response.data?.tags ?? [];
};

export const createDailyVerseTag = async (input: {
  slug: string;
  label: string;
}): Promise<DailyVerseTag> => {
  const response = await adminApi()["daily-verse-tags"].post(input);
  return response.data?.tag;
};
