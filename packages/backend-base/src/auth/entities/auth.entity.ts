export class AuthPayload {
  public readonly accessToken!: string;
  public readonly refreshToken?: string;
  public readonly verified!: boolean;
}
