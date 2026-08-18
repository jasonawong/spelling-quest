# Spelling Quest — Working Prototype

A touch-first, offline-capable spelling practice PWA for one child using one iPad.

## Included
- Parent mode with a 4-digit PIN (default: `1234`)
- Exactly 20 unique spelling words per week
- Listen & Spell using the device's speech synthesis
- Build the Word with touch-friendly letter tiles
- Finger handwriting canvas
- 2-minute Challenge Mode
- 20-word Practice Test with score shown at the end
- Quick Practice with adaptive weighting toward missed / unmastered words
- Stars, streaks, and weekly mastery
- Local-only storage; starting a new week resets progress
- Service worker + manifest for offline PWA use

## Fastest way to test on a computer
Because service workers require HTTP/HTTPS, serve the folder instead of double-clicking the file:

```bash
cd spelling-quest
python3 -m http.server 8000
```

Then open `http://localhost:8000`.

The core app will also open from `index.html` directly, but install/offline caching works only when served through HTTP/HTTPS.

## Put it on an iPad
1. Publish the contents of this folder on any HTTPS static host (GitHub Pages works well).
2. Open the site in Safari on the iPad.
3. Tap Share → **Add to Home Screen**.
4. Launch Spelling Quest from the new Home Screen icon.
5. Open Parent Mode with PIN `1234`, replace the sample words with the week's 20 words, and tap **Start New Week**.

## Notes
- Speech uses the iPad/browser's built-in speech synthesis. Voice availability can vary by device and installed language voices.
- Handwriting is intentionally self-checking in V1 rather than using handwriting recognition.
- No account, cloud service, analytics, or external API is required.
