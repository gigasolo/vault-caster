import { MarkdownView, Notice, Plugin, TFile, WorkspaceItem, WorkspaceLeaf } from "obsidian";
import { buildLibrary, formatTime, frontmatterEpisode, frontmatterTitle, rowLabel, type Course, type Episode } from "./library.ts";
import { Player } from "./player.ts";
import { VaultCasterView, VIEW_TYPE } from "./view.ts";

export default class VaultCasterPlugin extends Plugin {
	player!: Player;
	courses: Course[] = [];
	private status!: HTMLElement;
	private statusText: string | null = null;
	private refreshTimer: ReturnType<typeof setTimeout> | null = null;

	async onload(): Promise<void> {
		const stored = await this.loadData();
		this.player = new Player(stored, {
			courses: () => this.courses,
			resolveSrc: (path) => this.resourcePath(path),
			write: (data) => this.saveData(data),
			onError: (message) => new Notice(message),
		});
		this.player.subscribe(() => this.updateStatus());

		this.registerView(VIEW_TYPE, (leaf) => new VaultCasterView(leaf, this));
		this.addRibbonIcon("headphones", "Open VaultCaster", () => {
			void this.activateView();
		});
		this.addCommand({ id: "open", name: "Open player", callback: () => void this.activateView() });
		this.addCommand({ id: "toggle", name: "Toggle play", callback: () => this.player.toggle() });
		this.addCommand({ id: "next", name: "Next episode", callback: () => this.player.next() });
		this.addCommand({ id: "previous", name: "Previous episode", callback: () => this.player.previous() });
		this.addCommand({
			id: "open-note",
			name: "Open current episode note",
			callback: () => {
				const path = this.player.data.lastPath;
				const episode = path ? this.episodeByPath(path) : null;
				if (!episode?.notePath) {
					new Notice("VaultCaster could not find a script for this episode.");
					return;
				}
				void this.openNote(episode.notePath);
			},
		});

		this.status = this.addStatusBarItem();
		this.status.addClass("vault-caster-status");
		this.status.setAttribute("role", "button");
		this.status.tabIndex = 0;
		this.status.setAttribute("aria-label", "Open VaultCaster");
		this.registerDomEvent(this.status, "click", () => void this.activateView());
		this.registerDomEvent(this.status, "keydown", (event) => {
			if (event.key !== "Enter" && event.key !== " ") return;
			event.preventDefault();
			void this.activateView();
		});
		this.updateStatus();

		this.app.workspace.onLayoutReady(() => {
			void this.onWorkspaceReady();
		});
	}

	private async onWorkspaceReady(): Promise<void> {
		await this.repairDock();
		this.refreshLibrary();
		this.player.restore();
		this.registerEvent(this.app.vault.on("create", () => this.queueRefresh()));
		this.registerEvent(
			this.app.vault.on("delete", (file) => {
				this.player.forget(file.path);
				this.queueRefresh();
			}),
		);
		this.registerEvent(
			this.app.vault.on("rename", (file, oldPath) => {
				this.player.remap(oldPath, file.path);
				this.queueRefresh();
			}),
		);
		this.registerEvent(
			this.app.metadataCache.on("changed", (file) => {
				if (file.path.includes("/Podcast/scripts/")) this.queueRefresh();
			}),
		);
	}

	onunload(): void {
		if (this.refreshTimer) clearTimeout(this.refreshTimer);
		this.player.dispose();
	}

	async activateView(): Promise<void> {
		await this.app.workspace.ensureSideLeaf(VIEW_TYPE, "right", {
			active: true,
			split: false,
			reveal: true,
		});
	}

	/**
	 * The first build opened a new tab group, which Obsidian shows as the lower
	 * half of the sidebar. Move that lone leaf into the existing right-dock group
	 * once. Playback lives on the plugin, so detaching the view does not stop audio.
	 * Skip the flag when no leaf exists yet, so a later layout can still repair one.
	 */
	private async repairDock(): Promise<void> {
		const key = "vault-caster-dock-repaired";
		if (this.app.loadLocalStorage(key)) return;
		const { workspace } = this.app;
		const leaves = [...workspace.getLeavesOfType(VIEW_TYPE)];
		if (leaves.length === 0) return;
		for (const leaf of leaves) {
			if (!this.inRightDock(leaf)) continue;
			let alone = true;
			let otherGroup = false;
			workspace.iterateAllLeaves((other) => {
				if (other === leaf || !this.inRightDock(other)) return;
				if (other.parent === leaf.parent) alone = false;
				else otherGroup = true;
			});
			if (!alone || !otherGroup) continue;
			leaf.detach();
			await workspace.ensureSideLeaf(VIEW_TYPE, "right", {
				active: false,
				split: false,
				reveal: false,
			});
		}
		this.app.saveLocalStorage(key, "1");
	}

	private inRightDock(leaf: WorkspaceLeaf): boolean {
		const right = this.app.workspace.rightSplit;
		if (leaf.getRoot() === right) return true;
		let current: WorkspaceItem | null = leaf.parent;
		for (let depth = 0; current && depth < 12; depth++) {
			if (current === right) return true;
			current = current.parent;
		}
		return false;
	}

	episodeByPath(path: string): Episode | null {
		for (const course of this.courses) {
			const episode = course.episodes.find((item) => item.path === path);
			if (episode) return episode;
		}
		return null;
	}

	labelFor(episode: Episode): string {
		const file = episode.notePath ? this.app.vault.getAbstractFileByPath(episode.notePath) : null;
		const frontmatter = file instanceof TFile ? this.app.metadataCache.getFileCache(file)?.frontmatter : undefined;
		return rowLabel(episode.basename, frontmatterTitle(frontmatter?.title), frontmatterEpisode(frontmatter?.episode));
	}

	fallbackLabel(path: string): string {
		const file = path.slice(path.lastIndexOf("/") + 1);
		const dot = file.lastIndexOf(".");
		return (dot > 0 ? file.slice(0, dot) : file).replace(/-/g, " ");
	}

	async openNote(path: string): Promise<void> {
		const file = this.app.vault.getAbstractFileByPath(path);
		if (!(file instanceof TFile)) {
			new Notice(`VaultCaster could not find ${path}`);
			return;
		}
		let existing: WorkspaceLeaf | null = null;
		this.app.workspace.iterateAllLeaves((leaf) => {
			const view = leaf.view;
			if (view instanceof MarkdownView && view.file?.path === path) existing = leaf;
		});
		if (existing) {
			await this.app.workspace.revealLeaf(existing);
			return;
		}
		const leaf = this.app.workspace.getLeaf("tab");
		await leaf.openFile(file);
	}

	private refreshLibrary(): void {
		const files = this.app.vault.getFiles().map((file) => ({ path: file.path, extension: file.extension }));
		this.courses = buildLibrary(files, (path) => this.app.vault.getAbstractFileByPath(path) instanceof TFile);
		this.renderViews();
		this.updateStatus();
	}

	private queueRefresh(): void {
		if (this.refreshTimer) clearTimeout(this.refreshTimer);
		this.refreshTimer = setTimeout(() => {
			this.refreshTimer = null;
			this.refreshLibrary();
		}, 200);
	}

	private renderViews(): void {
		for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE)) {
			if (leaf.view instanceof VaultCasterView) leaf.view.render();
		}
	}

	private resourcePath(path: string): string | null {
		const file = this.app.vault.getAbstractFileByPath(path);
		if (!(file instanceof TFile)) return null;
		return this.app.vault.getResourcePath(file);
	}

	private updateStatus(): void {
		const path = this.player.data.lastPath;
		let text = "";
		if (path) {
			const episode = this.episodeByPath(path);
			const label = episode ? this.labelFor(episode).split("  ")[0] : this.fallbackLabel(path).split(" ")[0];
			const seconds = this.player.audio.currentSrc
				? this.player.audio.currentTime
				: (this.player.data.tracks[path]?.position ?? 0);
			text = `${label}  ${formatTime(seconds)}`;
		}
		if (text === this.statusText) return;
		this.statusText = text;
		this.status.style.display = text ? "" : "none";
		this.status.setText(text);
	}
}
