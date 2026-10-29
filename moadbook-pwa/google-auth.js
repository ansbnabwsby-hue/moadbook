(() => {
  'use strict';

  const SDK_APP_NAME = 'moadbook-google-auth';
  const AUTH_ROOT = 'https://identitytoolkit.googleapis.com/v1';
  const firebaseConfig = window.MOADBOOK_FIREBASE || {};
  let authInstance = null;

  function getAuth() {
    const sdk = window.firebase;
    if (!sdk?.initializeApp || !sdk?.auth) {
      const error = new Error('GOOGLE_AUTH_SDK_MISSING');
      error.code = 'GOOGLE_AUTH_SDK_MISSING';
      throw error;
    }
    if (!firebaseConfig.apiKey || !firebaseConfig.authDomain || !firebaseConfig.appId) {
      const error = new Error('GOOGLE_AUTH_CONFIG_MISSING');
      error.code = 'GOOGLE_AUTH_CONFIG_MISSING';
      throw error;
    }

    let app = sdk.apps.find((item) => item.name === SDK_APP_NAME);
    if (!app) app = sdk.initializeApp(firebaseConfig, SDK_APP_NAME);
    authInstance = sdk.auth(app);
    authInstance.languageCode = 'ar';
    return authInstance;
  }

  async function signIn() {
    const auth = getAuth();
    const provider = new window.firebase.auth.GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });

    // Invoke the popup directly from the button gesture; do not await setup first.
    try {
      const result = await auth.signInWithPopup(provider);
      const credential = window.firebase.auth.GoogleAuthProvider.credentialFromResult(result);
      const tokenResponse = result?._tokenResponse || result?.user?._tokenResponse || {};
      const returnedCredential = result?.credential || {};
      const postBody = new URLSearchParams({ providerId: 'google.com' });
      const oauthIdToken = credential?.idToken || returnedCredential.idToken || tokenResponse.oauthIdToken;
      const oauthAccessToken = credential?.accessToken || returnedCredential.accessToken || tokenResponse.oauthAccessToken;
      if (oauthIdToken) postBody.set('id_token', oauthIdToken);
      else if (oauthAccessToken) postBody.set('access_token', oauthAccessToken);
      else {
        const error = new Error('GOOGLE_CREDENTIAL_MISSING');
        error.code = 'GOOGLE_CREDENTIAL_MISSING';
        error.credentialDiagnostics = {
          credentialObject: Boolean(credential),
          resultCredential: Boolean(result?.credential),
          oauthIdToken: Boolean(tokenResponse.oauthIdToken),
          oauthAccessToken: Boolean(tokenResponse.oauthAccessToken),
          userPresent: Boolean(result?.user),
        };
        console.warn('Google OAuth returned no provider credential', error.credentialDiagnostics);
        throw error;
      }

      const response = await fetch(`${AUTH_ROOT}/accounts:signInWithIdp?key=${encodeURIComponent(firebaseConfig.apiKey)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          postBody: postBody.toString(),
          requestUri: window.location.origin,
          returnSecureToken: true,
          returnIdpCredential: true,
        }),
      });
      const text = await response.text();
      let data;
      try { data = text ? JSON.parse(text) : null; } catch { data = null; }
      if (!response.ok) {
        const code = data?.error?.message || `HTTP_${response.status}`;
        const error = new Error(String(code));
        error.code = String(code);
        error.firebaseCode = String(code);
        throw error;
      }

      return {
        ...data,
        displayName: data.displayName || result.user?.displayName || '',
        photoUrl: data.photoUrl || result.user?.photoURL || '',
      };
    } finally {
      // The app uses the REST refresh token as its single persistent session.
      if (auth.currentUser) await auth.signOut().catch(() => {});
    }
  }

  window.MoadbookGoogleAuth = Object.freeze({ signIn });
})();
