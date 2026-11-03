# Supabase video integration notes

- Supabase Free global file limit: 50 MB per file. Official docs: https://supabase.com/docs/guides/storage/uploads/file-limits
- Signed upload URLs are created with `createSignedUploadUrl(path)`, valid for 2 hours, and uploaded with `uploadToSignedUrl(path, token, file)`. Official docs: https://supabase.com/docs/reference/javascript/file-buckets-createsigneduploadurl and https://supabase.com/docs/reference/javascript/file-buckets-uploadtosignedurl
- The Moadbook Firebase project ID is `moadbook`; Firebase ID tokens use issuer `https://securetoken.google.com/moadbook` and audience `moadbook`.
- Supabase project created through the connected Supabase MCP: `moadbook-videos`, ref `suttmrgmxusyfjybnfek`, region `eu-central-1`.
- Storage bucket: `moadbook-videos`, configured at 50 MiB, public for social playback, with video MIME allowlist.
- Supabase Edge Function deployed: `moadbook-video-upload`, custom Firebase ID-token verification, creates one-time signed upload URLs; no service role key is exposed to the browser.
- Supabase project URL: https://suttmrgmxusyfjybnfek.supabase.co
