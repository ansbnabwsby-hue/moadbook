

## Audio extension (same project and bucket)
- The existing `moadbook-videos` bucket is reused; no new project or bucket was created.
- `moadbook-video-upload` remains the single Firebase-token-verifying Edge Function and now accepts audio uploads up to 15 MiB at `users/{firebaseUid}/audio/{uuid}.<ext>` while preserving the existing 50 MiB video path and allowlist.
- Supported audio MIME types: MP3/MPEG, WAV, M4A/MP4, AAC, OGG, and WebM.
- Audio message metadata is stored in Firebase `messages/{conversationId}/{messageId}` as `audioUrl`, `audioPath`, `audioMimeType`, `audioDuration`, and `audioName`.
- The browser only uses the existing Supabase publishable key and Firebase ID token; the service-role key remains inside the Edge Function.
