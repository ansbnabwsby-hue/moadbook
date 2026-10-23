// Load environment variables with proper priority (system > .env)
import "./scripts/load-env.js";
import type { ExpoConfig } from "expo/config";

// Bundle ID format: space.manus.<project_name_dots>.<timestamp>
// e.g., "my-app" created at 2024-01-15 10:30:45 -> "space.manus.my.app.t20240115103045"
// Bundle ID can only contain letters, numbers, and dots
// Android requires each dot-separated segment to start with a letter
const rawBundleId = "space.manus.moadbookios.t247704656869767";
const bundleId =
  rawBundleId
    .replace(/[-_]/g, ".") // Replace hyphens/underscores with dots
    .replace(/[^a-zA-Z0-9.]/g, "") // Remove invalid chars
    .replace(/\.+/g, ".") // Collapse consecutive dots
    .replace(/^\.+|\.+$/g, "") // Trim leading/trailing dots
    .toLowerCase()
    .split(".")
    .map((segment) => {
      // Android requires each segment to start with a letter
      // Prefix with 'x' if segment starts with a digit
      return /^[a-zA-Z]/.test(segment) ? segment : "x" + segment;
    })
    .join(".") || "space.manus.app";
// Extract timestamp from bundle ID and prefix with "manus" for deep link scheme
// e.g., "space.manus.my.app.t20240115103045" -> "manus20240115103045"
const timestamp = bundleId.split(".").pop()?.replace(/^t/, "") ?? "";
const schemeFromBundleId = `manus${timestamp}`;

const env = {
  // App branding - update these values directly (do not use env vars)
  appName: "moadbook",
  appSlug: "moadbookios",
  // Stable public project-branding asset, separate from the bundled native icon.
  logoUrl: "https://files.manuscdn.com/user_upload_by_module/session_file/310519664026458177/CdfgVMoJsOiyQlNM.png",
  scheme: schemeFromBundleId,
  iosBundleId: bundleId,
  androidPackage: bundleId,
};

// Expo serializes this browser-safe subset into native and web bundles. The server-only
// MANUS_API_KEY and MANUS_JWT_SECRET must never enter this object.
const publicRuntime = {
  oauthPortalUrl:
    process.env.MANUS_OAUTH_PORTAL_URL ??
    process.env.VITE_OAUTH_PORTAL_URL ??
    process.env.EXPO_PUBLIC_OAUTH_PORTAL_URL ??
    "",
  oauthServerUrl:
    process.env.MANUS_OAUTH_API_URL ??
    process.env.OAUTH_SERVER_URL ??
    process.env.EXPO_PUBLIC_OAUTH_SERVER_URL ??
    "",
  appId:
    process.env.MANUS_PROJECT_ID ??
    process.env.VITE_APP_ID ??
    process.env.EXPO_PUBLIC_APP_ID ??
    "",
  apiBaseUrl: process.env.EXPO_PUBLIC_API_BASE_URL ?? "",
};

const config: ExpoConfig = {
  name: env.appName,
  slug: env.appSlug,
  version: "1.0.0",
  githubUrl: "https://github.com/ansbnabwsby-hue/moadbook",
  extra: {
    ...publicRuntime,
    moadbookFirebase: {
      apiKey: "AIzaSyBLRvygDKQZBYBi3HyT_EW_3AQMI4a9ILk",
      authDomain: "moadbook.firebaseapp.com",
      databaseURL: "https://moadbook-default-rtdb.firebaseio.com",
      projectId: "moadbook",
      storageBucket: "moadbook.firebasestorage.app",
      appId: "1:344784022939:android:196cc363bb0ba9cec7c53e",
      messagingSenderId: "344784022939",
    },
  },
  orientation: "portrait",
  icon: "./assets/images/icon.png",
  scheme: env.scheme,
  userInterfaceStyle: "automatic",
  ios: {
    supportsTablet: true,
    bundleIdentifier: env.iosBundleId,
    "infoPlist": {
        "ITSAppUsesNonExemptEncryption": false
      }
  },
  android: {
    adaptiveIcon: {
      backgroundColor: "#EDE9FD",
      foregroundImage: "./assets/images/android-icon-foreground.png",
    },
    predictiveBackGestureEnabled: false,
    package: env.androidPackage,
    permissions: ["POST_NOTIFICATIONS"],
    intentFilters: [
      {
        action: "VIEW",
        autoVerify: true,
        data: [
          {
            scheme: env.scheme,
            host: "*",
          },
        ],
        category: ["BROWSABLE", "DEFAULT"],
      },
    ],
  },
  web: {
    bundler: "metro",
    output: "static",
    favicon: "./assets/images/favicon.png",
  },
  plugins: [
    "expo-asset",
    "expo-router",
    [
      "expo-image-picker",
      {
        photosPermission: "نحتاج الوصول إلى صورك لاختيار صورة ومشاركتها في moadbook.",
      },
    ],
    [
      "expo-audio",
      {
        microphonePermission: "Allow $(PRODUCT_NAME) to access your microphone.",
      },
    ],
    [
      "expo-video",
      {
        supportsBackgroundPlayback: true,
        supportsPictureInPicture: true,
      },
    ],
    [
      "expo-splash-screen",
      {
        image: "./assets/images/splash-icon.png",
        imageWidth: 200,
        resizeMode: "contain",
        backgroundColor: "#ffffff",
        dark: {
          backgroundColor: "#000000",
        },
      },
    ],
    [
      "expo-build-properties",
      {
        android: {
          buildArchs: ["armeabi-v7a", "arm64-v8a"],
          minSdkVersion: 24,
        },
      },
    ],
  ],
  experiments: {
    typedRoutes: true,
    reactCompiler: true,
    baseUrl: process.env.EXPO_PUBLIC_BASE_URL ?? "",
  },
};

export default config;
