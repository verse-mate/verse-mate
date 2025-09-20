export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  fullName: string;
  emailVerified?: boolean;
  is_admin?: boolean;
  preferred_language?: string | null;
}
