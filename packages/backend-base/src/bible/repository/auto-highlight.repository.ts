import type { db } from "../../shared/shared.plugin";

export interface AutoHighlight {
  auto_highlight_id: number;
  theme_id: number;
  book_id: number;
  chapter_number: number;
  start_verse: number;
  end_verse: number;
  relevance_score: number;
  created_at: Date | null;
  theme_name?: string;
  theme_color?: string;
}

export interface HighlightTheme {
  theme_id: number;
  name: string;
  color: string;
  description: string | null;
  is_system: boolean;
  priority: number;
  is_active: boolean;
  default_relevance_threshold: number;
  created_at: Date;
  updated_at: Date;
}

export interface UserThemePreference {
  user_id: string;
  theme_id: number;
  is_enabled: boolean;
  custom_color: string | null;
  relevance_threshold: number;
  admin_override: boolean;
  updated_at: Date;
  theme_name?: string;
  theme_color?: string;
  theme_description?: string;
}

export class AutoHighlightRepository {
  constructor(private readonly db: db) {}

  async getHighlightsByChapter(params: {
    book_id: number;
    chapter_number: number;
    theme_ids?: number[];
    theme_relevance_map?: Map<number, number>;
    default_relevance?: number;
  }): Promise<AutoHighlight[]> {
    let query = this.db
      .getOrCreateConnection()
      .selectFrom("auto_highlights")
      .innerJoin(
        "highlight_themes",
        "auto_highlights.theme_id",
        "highlight_themes.theme_id",
      )
      .where("auto_highlights.book_id", "=", params.book_id)
      .where("auto_highlights.chapter_number", "=", params.chapter_number)
      .where("highlight_themes.is_active", "=", true);

    if (params.theme_ids && params.theme_ids.length > 0) {
      query = query.where("auto_highlights.theme_id", "in", params.theme_ids);
    }

    const results = await query
      .selectAll("auto_highlights")
      .select([
        "highlight_themes.name as theme_name",
        "highlight_themes.color as theme_color",
      ])
      .execute();

    // Filter by per-theme relevance if provided
    if (params.theme_relevance_map && params.theme_relevance_map.size > 0) {
      return results.filter((highlight: any) => {
        const themeRelevance = params.theme_relevance_map?.get(
          highlight.theme_id,
        );
        const relevanceThreshold =
          themeRelevance ?? params.default_relevance ?? 5;
        return highlight.relevance_score <= relevanceThreshold;
      });
    }

    // Otherwise use default relevance
    if (params.default_relevance !== undefined) {
      const threshold = params.default_relevance;
      return results.filter((h: any) => h.relevance_score <= threshold);
    }

    return results as AutoHighlight[];
  }

  async bulkInsertHighlights(
    highlights: {
      theme_id: number;
      book_id: number;
      chapter_number: number;
      start_verse: number;
      end_verse: number;
      relevance_score: number;
    }[],
  ): Promise<void> {
    if (highlights.length === 0) return;

    await this.db
      .getOrCreateConnection()
      .insertInto("auto_highlights")
      .values(highlights as any)
      .execute();
  }

  async deleteHighlightsByBook(book_id: number): Promise<void> {
    await this.db
      .getOrCreateConnection()
      .deleteFrom("auto_highlights")
      .where("book_id", "=", book_id)
      .execute();
  }

  async getAllThemes(): Promise<HighlightTheme[]> {
    const themes = await this.db
      .getOrCreateConnection()
      .selectFrom("highlight_themes")
      .selectAll()
      .orderBy("priority", "asc")
      .execute();

    return themes as HighlightTheme[];
  }

  async getActiveThemes(): Promise<HighlightTheme[]> {
    const themes = await this.db
      .getOrCreateConnection()
      .selectFrom("highlight_themes")
      .where("is_active", "=", true)
      .selectAll()
      .orderBy("priority", "asc")
      .execute();

    return themes as HighlightTheme[];
  }

  async updateThemeActiveStatus(
    theme_id: number,
    is_active: boolean,
  ): Promise<void> {
    await this.db
      .getOrCreateConnection()
      .updateTable("highlight_themes")
      .set({ is_active, updated_at: new Date() } as any)
      .where("theme_id", "=", theme_id)
      .execute();
  }

  async updateThemeDefaultRelevance(
    theme_id: number,
    default_relevance_threshold: number,
  ): Promise<void> {
    await this.db
      .getOrCreateConnection()
      .updateTable("highlight_themes")
      .set({ default_relevance_threshold, updated_at: new Date() } as any)
      .where("theme_id", "=", theme_id)
      .execute();
  }

  async getUserThemePreferences(
    user_id: string,
  ): Promise<UserThemePreference[]> {
    const prefs = await this.db
      .getOrCreateConnection()
      .selectFrom("user_theme_preferences")
      .innerJoin(
        "highlight_themes",
        "user_theme_preferences.theme_id",
        "highlight_themes.theme_id",
      )
      .where("user_id", "=", user_id)
      .selectAll("user_theme_preferences")
      .select([
        "highlight_themes.name as theme_name",
        "highlight_themes.color as theme_color",
        "highlight_themes.description as theme_description",
      ])
      .execute();

    return prefs as UserThemePreference[];
  }

  async upsertUserThemePreference(params: {
    user_id: string;
    theme_id: number;
    is_enabled?: boolean;
    custom_color?: string;
    relevance_threshold?: number;
    admin_override?: boolean;
  }): Promise<void> {
    const updateData: any = {
      updated_at: new Date(),
    };

    if (params.is_enabled !== undefined) {
      updateData.is_enabled = params.is_enabled;
    }
    if (params.custom_color !== undefined) {
      updateData.custom_color = params.custom_color;
    }
    if (params.relevance_threshold !== undefined) {
      updateData.relevance_threshold = params.relevance_threshold;
    }
    if (params.admin_override !== undefined) {
      updateData.admin_override = params.admin_override;
    }

    await this.db
      .getOrCreateConnection()
      .insertInto("user_theme_preferences")
      .values({
        user_id: params.user_id,
        theme_id: params.theme_id,
        is_enabled: params.is_enabled ?? true,
        custom_color: params.custom_color ?? null,
        relevance_threshold: params.relevance_threshold ?? 3,
        updated_at: new Date(),
      } as any)
      .onConflict((oc) =>
        oc.columns(["user_id", "theme_id"]).doUpdateSet(updateData),
      )
      .execute();
  }

  async getThemeByName(name: string): Promise<HighlightTheme | undefined> {
    const theme = await this.db
      .getOrCreateConnection()
      .selectFrom("highlight_themes")
      .where("name", "=", name)
      .selectAll()
      .executeTakeFirst();

    return theme as HighlightTheme | undefined;
  }

  async getGlobalSetting(key: string): Promise<string | null> {
    const result = await this.db
      .getOrCreateConnection()
      .selectFrom("auto_highlight_settings")
      .where("setting_key", "=", key)
      .select("setting_value")
      .executeTakeFirst();

    return result?.setting_value ?? null;
  }

  async updateGlobalSetting(key: string, value: string): Promise<void> {
    await this.db
      .getOrCreateConnection()
      .insertInto("auto_highlight_settings")
      .values({
        setting_key: key,
        setting_value: value,
        updated_at: new Date(),
      } as any)
      .onConflict((oc) =>
        oc.column("setting_key").doUpdateSet({
          setting_value: value,
          updated_at: new Date(),
        } as any),
      )
      .execute();
  }
}
