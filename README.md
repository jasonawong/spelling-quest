# Spelling Quest — Working Prototype

A touch-first, offline-capable spelling practice PWA for one child using one iPad.

## Included
- Read-only list of 20 spelling words
- Type the Word with a one-second preview, picture clues, and the device's speech synthesis
- Build the Word with touch-friendly letter tiles
- Sound the Word with capybara-themed sound-to-spelling chunk mapping
- Write the Word with a one-second preview, picture clue, and finger handwriting canvas
- Word Detective with 20 sentence-matched anime scenes and inline missing-letter clues
- 20-word Practice Test with score shown at the end
- Stars, streaks, and weekly mastery
- Local-only progress storage
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
5. Tap **Word List** to review the 20 words in the quest.

## Notes
- Speech uses the iPad/browser's built-in speech synthesis. It prefers the device's default English voice and falls back to another installed English voice, then `en-US`.
- Handwriting is intentionally self-checking in V1 rather than using handwriting recognition.
- No account, cloud service, analytics, or external API is required.
