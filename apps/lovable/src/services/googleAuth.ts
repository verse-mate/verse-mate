/**
 * Google Identity Services wrapper.
 *
 * Loads the GIS script on demand and exposes:
 *   - getGoogleIdToken(container): render the official Google sign-in
 *     button into `container`. When the user clicks it and completes the
 *     flow, returns the ID token via the accompanying promise.
 *   - renderGoogleButton(container, onCredential): lower-level helper for
 *     components that just want to mount the button directly.
 *
 * We use the renderButton flow rather than gis.prompt() because the
 * One Tap prompt silently fails inside iframes (like the Lovable preview)
 * with "skipped: unknown_reason". The rendered button opens a real popup
 * window, which is reliable across browsers and iframes.
 *
 * Requires VITE_GOOGLE_CLIENT_ID at build time; defaults to the VerseMate
 * production client id discovered via /auth/sso/google/redirect.
 *
 * ⚠ The Google Cloud Console OAuth client must list this app's origin under
 * "Authorized JavaScript origins" or GIS returns "invalid origin".
 */

const DEFAULT_CLIENT_ID =
  '94126503648-2fb9dakdfi8pmi8ep78bk5nsrv94db6o.apps.googleusercontent.com';

export const GOOGLE_CLIENT_ID =
  (import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined) || DEFAULT_CLIENT_ID;

declare global {
  interface Window {
    google?: {
      accounts?: {
        id?: {
          initialize: (config: {
            client_id: string;
            callback: (resp: { credential: string }) => void;
            ux_mode?: 'popup' | 'redirect';
            auto_select?: boolean;
            use_fedcm_for_prompt?: boolean;
          }) => void;
          prompt: (cb?: (notification: unknown) => void) => void;
          renderButton: (el: HTMLElement, opts: Record<string, unknown>) => void;
          cancel: () => void;
        };
      };
    };
  }
}

let _loadPromise: Promise<void> | null = null;

export function loadGoogleIdentityServices(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  if (window.google?.accounts?.id) return Promise.resolve();
  if (_loadPromise) return _loadPromise;
  _loadPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => {
      if (window.google?.accounts?.id) resolve();
      else reject(new Error('Google Identity Services failed to load'));
    };
    script.onerror = () =>
      reject(new Error('Failed to load Google Identity Services script'));
    document.head.appendChild(script);
  });
  return _loadPromise;
}

/**
 * Render the official Google sign-in button into `container`. Calls
 * `onCredential` with the Google ID token when the user completes the flow.
 */
export async function renderGoogleButton(
  container: HTMLElement,
  onCredential: (idToken: string) => void,
  onError?: (err: Error) => void
): Promise<void> {
  try {
    await loadGoogleIdentityServices();
    const gis = window.google?.accounts?.id;
    if (!gis) throw new Error('Google Identity Services not available');

    gis.initialize({
      client_id: GOOGLE_CLIENT_ID,
      callback: resp => {
        if (resp?.credential) onCredential(resp.credential);
        else onError?.(new Error('No credential returned from Google'));
      },
      ux_mode: 'popup',
      // FedCM is the newer Chrome flow; enabling it avoids some popup-blocker issues
      use_fedcm_for_prompt: true,
    });

    container.innerHTML = '';
    gis.renderButton(container, {
      type: 'standard',
      theme: 'filled_blue',
      size: 'large',
      text: 'continue_with',
      shape: 'pill',
      logo_alignment: 'left',
      width: container.offsetWidth > 0 ? container.offsetWidth : 320,
    });
  } catch (err) {
    onError?.(err instanceof Error ? err : new Error(String(err)));
  }
}
