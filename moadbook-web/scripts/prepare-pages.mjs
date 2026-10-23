import { access, copyFile, mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

const outputDirectory = resolve("dist");
const routes = [
  "compose",
  "explore",
  "profile",
  "messages",
  "notifications",
  "oauth/callback",
];

for (const route of routes) {
  const source = join(outputDirectory, `${route}.html`);
  const destination = join(outputDirectory, route, "index.html");
  await access(source);
  await mkdir(dirname(destination), { recursive: true });
  await copyFile(source, destination);
}

await copyFile(join(outputDirectory, "+not-found.html"), join(outputDirectory, "404.html"));
await writeFile(join(outputDirectory, ".nojekyll"), "");
