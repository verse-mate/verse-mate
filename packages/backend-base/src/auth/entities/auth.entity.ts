/**
 * Auth payload returned by login/signup. Per spec feat-auth-platform br-auth-001
 * (D-005): no refreshToken — access token IS the persistent session token.
 */
export class AuthPayload {
  public readonly accessToken!: string;
  public readonly verified!: boolean;
}
