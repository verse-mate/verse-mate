export type UserSession = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  is_admin: boolean;
  preferred_language?: string | null;
};
