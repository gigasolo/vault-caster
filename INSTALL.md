# Install VaultCaster

VaultCaster is a desktop Obsidian plugin. You need Obsidian 1.8.7 or newer. Turn on Community plugins in Settings if that switch is still off.

## Copy the release files

1. Download `main.js`, `manifest.json`, and `styles.css` from the repository.
2. Create a folder named `vault-caster` inside your vault’s plugin directory:

   ```text
   YourVault/.obsidian/plugins/vault-caster/
   ```

3. Put the three files in that folder.
4. Reload Obsidian (`Ctrl+R`, or quit and open it again).
5. Open Settings → Community plugins and enable **VaultCaster**.
6. Click the headphones icon on the left ribbon. The player opens as a tab in the right sidebar.

## Build from source

```sh
git clone https://github.com/gigasolo/vault-caster.git
cd vault-caster
npm install
npm run build
```

Copy `main.js`, `manifest.json`, and `styles.css` into `.obsidian/plugins/vault-caster/` as above.

To copy them into a vault during the build, set `VAULT_CASTER_PLUGIN_DIR` to that folder:

```sh
VAULT_CASTER_PLUGIN_DIR="/path/to/YourVault/.obsidian/plugins/vault-caster" npm run build
```

## Update

Replace the three files in `.obsidian/plugins/vault-caster/` and reload Obsidian. Saved progress stays in `data.json` in that same folder. Leave `data.json` in place when you update.
