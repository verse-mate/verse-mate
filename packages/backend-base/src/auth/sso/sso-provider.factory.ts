import { ValidationError } from "../../common/errors";
import { AppleSSOProvider } from "./apple-sso.provider";
import { GoogleSSOProvider } from "./google-sso.provider";
import type { SSOProvider } from "./sso-provider.interface";

/**
 * Supported SSO provider types
 */
export type SSOProviderType = "google" | "apple";

/**
 * SSO Provider Factory
 *
 * Creates and returns the appropriate SSO provider implementation
 * based on the requested provider type.
 *
 * This factory pattern allows for:
 * - Easy addition of new providers in the future
 * - Centralized provider instantiation
 * - Consistent error handling for unsupported providers
 *
 * @example
 * ```ts
 * const factory = new SSOProviderFactory();
 * const googleProvider = factory.getProvider('google');
 * const tokenPayload = await googleProvider.verifyToken(token, 'mobile');
 * const userInfo = await googleProvider.getUserInfo(tokenPayload);
 * ```
 */
export class SSOProviderFactory {
  private readonly providers: Map<SSOProviderType, SSOProvider>;

  constructor() {
    // Initialize providers lazily to allow for configuration changes
    this.providers = new Map();
  }

  /**
   * Get an SSO provider implementation by type
   *
   * @param provider - The type of SSO provider to get
   * @returns The corresponding SSO provider implementation
   * @throws ValidationError if the provider type is not supported
   */
  getProvider(provider: SSOProviderType): SSOProvider {
    // Check if provider is already instantiated
    const existingProvider = this.providers.get(provider);
    if (existingProvider) {
      return existingProvider;
    }

    // Create new provider instance based on type
    let newProvider: SSOProvider;

    switch (provider) {
      case "google":
        newProvider = new GoogleSSOProvider();
        break;
      case "apple":
        newProvider = new AppleSSOProvider();
        break;
      default:
        throw new ValidationError(
          `Unsupported SSO provider: ${provider}. Supported providers are: google, apple`,
        );
    }

    // Cache the provider instance
    this.providers.set(provider, newProvider);

    return newProvider;
  }

  /**
   * Check if a provider type is supported
   *
   * @param provider - The provider type to check
   * @returns true if the provider is supported
   */
  isSupported(provider: string): provider is SSOProviderType {
    return provider === "google" || provider === "apple";
  }

  /**
   * Get list of supported provider types
   *
   * @returns Array of supported provider type names
   */
  getSupportedProviders(): SSOProviderType[] {
    return ["google", "apple"];
  }
}

/**
 * Singleton instance of the SSO provider factory
 * Use this for consistent provider instances across the application
 */
export const ssoProviderFactory = new SSOProviderFactory();
