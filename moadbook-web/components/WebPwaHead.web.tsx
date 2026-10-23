import { useEffect } from "react";
import Head from "expo-router/head";

const BASE_PATH = process.env.EXPO_PUBLIC_BASE_URL ?? "";

export function WebPwaHead() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;

    const scope = `${BASE_PATH}/`;
    void navigator.serviceWorker.register(`${scope}sw.js`, { scope }).catch((error: unknown) => {
      console.warn("moadbook PWA service worker could not be registered", error);
    });
  }, []);

  return (
    <Head>
      <meta name="theme-color" content="#5147D9" />
      <meta name="apple-mobile-web-app-capable" content="yes" />
      <meta name="apple-mobile-web-app-status-bar-style" content="default" />
      <meta name="apple-mobile-web-app-title" content="moadbook" />
      <link rel="manifest" href={`${BASE_PATH}/manifest.webmanifest`} />
      <link rel="apple-touch-icon" href={`${BASE_PATH}/icon.png`} />
    </Head>
  );
}
