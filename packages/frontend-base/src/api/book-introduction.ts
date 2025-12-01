import { api } from "backend-api";

export interface BookIntroduction {
  introduction_id: string;
  book_id: number;
  author: string;
  date_written: string;
  biblical_role: string;
  key_themes: string[];
  related_books: string;
  literary_style: string;
  full_intro_text: string;
  language_code: string;
  version: number;
  is_active: boolean;
  created_by_admin: boolean;
  created_at: string;
  updated_at: string;
}

export interface BookIntroductionResponse {
  introduction: BookIntroduction | null;
  hasViewed?: boolean;
}

/**
 * Fetch book introduction from the backend
 */
export async function getBookIntroduction(
  bookId: number,
  languageCode = "en",
): Promise<BookIntroductionResponse> {
  try {
    const response = await api.bible
      .book({ bookId: bookId.toString() })
      .introduction.get({
        query: { languageCode },
      });

    if (response.error) {
      console.error("Error fetching book introduction:", response.error);
      return { introduction: null, hasViewed: false };
    }

    return response.data || { introduction: null, hasViewed: false };
  } catch (error) {
    console.error("Error fetching book introduction:", error);
    return { introduction: null, hasViewed: false };
  }
}

/**
 * Mark a book introduction as viewed
 */
export async function markIntroductionAsViewed(
  bookId: number,
): Promise<boolean> {
  try {
    const response = await api.bible
      .book({ bookId: bookId.toString() })
      .introduction["mark-viewed"].post({});

    if (response.error) {
      console.error("Error marking introduction as viewed:", response.error);
      return false;
    }

    return response.data?.success || false;
  } catch (error) {
    console.error("Error marking introduction as viewed:", error);
    return false;
  }
}
