"use client";

/**
 * Microsoft Entra ID sign-in for the browser (MSAL). Enabled when NEXT_PUBLIC_ENTRA_CLIENT_ID is set;
 * otherwise the office runs without a token and the backend must be in AUTH_MODE=dev.
 * The access token is sent to the same-origin proxy, which forwards it to the FastAPI backend,
 * where it is validated (signature, issuer, audience) and mapped to roles.
 */
import type { AccountInfo, IPublicClientApplication } from "@azure/msal-browser";

const clientId = process.env.NEXT_PUBLIC_ENTRA_CLIENT_ID;
const tenantId = process.env.NEXT_PUBLIC_ENTRA_TENANT_ID ?? "organizations";
const apiScope = process.env.NEXT_PUBLIC_ENTRA_API_SCOPE; // e.g. api://<api-app-id>/Hub.Access

export const entraEnabled = Boolean(clientId && apiScope);

let pca: Promise<IPublicClientApplication> | null = null;

async function getPca() {
  if (!pca) {
    pca = (async () => {
      const { PublicClientApplication } = await import("@azure/msal-browser");
      const app = new PublicClientApplication({
        auth: {
          clientId: clientId!,
          authority: `https://login.microsoftonline.com/${tenantId}`,
          redirectUri: window.location.origin + "/hq",
        },
        cache: { cacheLocation: "sessionStorage" },
      });
      await app.initialize();
      const result = await app.handleRedirectPromise();
      if (result?.account) app.setActiveAccount(result.account);
      return app;
    })();
  }
  return pca;
}

export async function getAccount(): Promise<AccountInfo | null> {
  if (!entraEnabled) return null;
  const app = await getPca();
  return app.getActiveAccount() ?? app.getAllAccounts()[0] ?? null;
}

export async function signIn() {
  if (!entraEnabled) return;
  const app = await getPca();
  await app.loginRedirect({ scopes: [apiScope!] });
}

export async function signOut() {
  if (!entraEnabled) return;
  const app = await getPca();
  await app.logoutRedirect();
}

export async function getAccessToken(): Promise<string | null> {
  if (!entraEnabled) return null;
  const app = await getPca();
  const account = app.getActiveAccount() ?? app.getAllAccounts()[0];
  if (!account) return null;
  try {
    const res = await app.acquireTokenSilent({ scopes: [apiScope!], account });
    return res.accessToken;
  } catch {
    await app.acquireTokenRedirect({ scopes: [apiScope!], account });
    return null;
  }
}
