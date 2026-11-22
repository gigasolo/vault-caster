# VaultCaster

Play a course the way it is already stored in your Obsidian vault. VaultCaster reads each `<course>/Podcast/audio` folder, keeps your place, and opens the matching script beside the audio.

Desktop only. Requires Obsidian 1.8.7 or newer. [MIT licensed](LICENSE).

## A course

```text
Course name/
  Podcast/
    audio/
      E00-Trailer.mp3
      E01-Introduction.mp3
    scripts/
      E00-Trailer.md
      E01-Introduction.md
```

Audio may be mp3, m4a, wav, ogg, flac, aac, or opus. Files nested deeper than `Podcast/audio` are ignored, so a `Meetings/audio` folder is left alone. Episode order is natural: `E02` stays before `E10`.

The row title is the script’s frontmatter `title`, prefixed with the episode token (`E01`). Without a title, the filename is shown with hyphens turned into spaces. A check mark means finished. A percent means started.

## Listening

Open VaultCaster from the headphones ribbon icon, the status bar, or the command **Open player**. The player joins the right sidebar as another tab.

| Command | What it does |
| --- | --- |
| Open player | Show VaultCaster |
| Toggle play | Pause or resume |
| Next episode | Next episode in this course |
| Previous episode | Previous episode in this course |
| Open current episode note | Open the script for the episode that is loaded |

Speed is one of 1, 1.25, 1.5, 1.75, or 2. When an episode ends it is marked finished, its saved position returns to 0, and the next episode plays. The last episode stops. Reopening Obsidian restores the last episode, paused, at the saved position.

Playback belongs to the plugin. Closing the sidebar leaves the audio running.

## Install

See [INSTALL.md](INSTALL.md). History is in [CHANGELOG.md](CHANGELOG.md).

## Develop

```sh
npm install
npm test
npm run build
```

`npm run build` writes `main.js`. When `VAULT_CASTER_PLUGIN_DIR` is set, or when this machine’s vault plugin folder is already present, the build also copies `main.js`, `manifest.json`, and `styles.css` there.
