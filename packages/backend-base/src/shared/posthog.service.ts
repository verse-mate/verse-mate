import { type EventMessage, PostHog } from "posthog-node";

export interface Logger {
  child: (context: { component: string }) => Logger;
  warn: (message: string, ...args: unknown[]) => void;
  error: (error: unknown) => void;
}

export class PosthogService {
  private readonly logger: Logger;
  private readonly client: PostHog | undefined;

  constructor({ logger }: { logger: Logger }) {
    this.logger = logger.child({ component: PosthogService.name });
    this.logger.warn("Initializing...");

    const posthogHost = process.env.POSTHOG_HOST;
    const posthogKey = process.env.POSTHOG_KEY;
    if (posthogKey && posthogHost) {
      this.client = new PostHog(posthogKey, { host: posthogHost });
    } else {
      this.logger.warn("Missing PostHog environment variables");
    }
  }

  async disconnect() {
    await this.client?.shutdown();
  }

  capture(props: EventMessage) {
    if (!this.client) {
      return this.logger.warn(
        "PostHog client not initialized, skipping capture",
        props,
      );
    }
    return this.client.capture(props);
  }

  captureException(
    error: unknown,
    distinctId?: string,
    additionalProperties?: Record<string | number, unknown>,
  ) {
    this.logger.error(error);
    if (!this.client) {
      this.logger.warn("PostHog client not initialized, skipping capture");
      return;
    }
    return this.client.captureException(
      error,
      distinctId,
      additionalProperties,
    );
  }

  /**
   * Check if the PostHog client is initialized
   */
  isInitialized(): boolean {
    return this.client !== undefined;
  }
}
