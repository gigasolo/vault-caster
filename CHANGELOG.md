# Changelog

## 0.1.0 — 2026-11-22

First release of VaultCaster. It replaces the local GigaPlayer build.

- Finds every course that keeps episodes in `<course>/Podcast/audio` and lists them in filename order.
- Remembers position, speed, and volume. An episode is finished at 95% or when it ends, and the next episode in that course starts.
- Opens the matching script in `<course>/Podcast/scripts` without stopping playback.
- Lives in the existing right sidebar. The transport stays put while the episode list scrolls. Closing the sidebar does not stop the audio.
