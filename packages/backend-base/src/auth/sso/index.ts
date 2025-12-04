/**
 * SSO Module Exports
 *
 * This module provides Single Sign-On (SSO) functionality for VerseMate,
 * supporting Google and Apple authentication for both web and mobile platforms.
 */

// Interfaces and types
export type {
  SSOPlatform,
  SSOProvider,
  SSOTokenPayload,
  SSOUserInfo,
} from "./sso-provider.interface";

// Provider implementations
export { GoogleSSOProvider } from "./google-sso.provider";
export { AppleSSOProvider } from "./apple-sso.provider";

// Factory
export {
  SSOProviderFactory,
  ssoProviderFactory,
  type SSOProviderType,
} from "./sso-provider.factory";

// Repository
export { UserSsoAccountRepository } from "./user-sso-account.repository";
