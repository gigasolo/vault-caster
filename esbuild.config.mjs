import esbuild from "esbuild";
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

const vaultPlugin = process.env.VAULT_CASTER_PLUGIN_DIR
	?? "/home/lonbaker/Documents/Vault/.obsidian/plugins/vault-caster";

await esbuild.build({
	entryPoints: ["src/main.ts"],
	bundle: true,
	external: ["obsidian"],
	format: "cjs",
	target: "es2022",
	outfile: "main.js",
	logLevel: "info",
});

if (existsSync(dirname(vaultPlugin))) {
	mkdirSync(vaultPlugin, { recursive: true });
	for (const file of ["main.js", "manifest.json", "styles.css"]) {
		copyFileSync(file, `${vaultPlugin}/${file}`);
	}
}
