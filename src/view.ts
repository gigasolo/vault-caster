import { ItemView, setIcon, WorkspaceLeaf } from "obsidian";
import { formatTime, progressPercent, SPEEDS, type Course, type Episode } from "./library.ts";
import type { Player } from "./player.ts";

export const VIEW_TYPE = "vault-caster";

export interface PlayerViewHost {
	player: Player;
	courses: Course[];
	episodeByPath(path: string): Episode | null;
	labelFor(episode: Episode): string;
	fallbackLabel(path: string): string;
	openNote(path: string): Promise<void>;
}

interface EpisodeRow {
	row: HTMLElement;
	play: HTMLButtonElement;
	mark: HTMLElement;
}

interface CourseCount {
	el: HTMLElement;
	episodes: Episode[];
}

let nextViewId = 0;

export class VaultCasterView extends ItemView {
	private seeking = false;
	private unsubscribe: (() => void) | null = null;
	private nowTitle: HTMLElement | null = null;
	private playButton: HTMLButtonElement | null = null;
	private currentEl: HTMLElement | null = null;
	private durationEl: HTMLElement | null = null;
	private seek: HTMLInputElement | null = null;
	private speed: HTMLSelectElement | null = null;
	private volume: HTMLInputElement | null = null;
	private coursesEl: HTMLElement | null = null;
	private rows = new Map<string, EpisodeRow>();
	private courseCounts: CourseCount[] = [];

	constructor(
		leaf: WorkspaceLeaf,
		private plugin: PlayerViewHost,
	) {
		super(leaf);
	}

	getViewType(): string {
		return VIEW_TYPE;
	}

	getDisplayText(): string {
		return "VaultCaster";
	}

	getIcon(): string {
		return "headphones";
	}

	async onOpen(): Promise<void> {
		const root = this.contentEl;
		root.empty();
		root.addClass("vault-caster");
		const viewId = `vault-caster-${++nextViewId}`;

		const now = root.createDiv({ cls: "vault-caster-now" });
		this.nowTitle = now.createDiv({ cls: "vault-caster-now-title", text: "No episode selected" });

		const transport = now.createDiv({ cls: "vault-caster-transport" });
		this.iconButton(transport, "skip-back", "Previous episode", () => this.plugin.player.previous());
		this.playButton = this.iconButton(transport, "play", "Play", () => this.plugin.player.toggle());
		this.iconButton(transport, "skip-forward", "Next episode", () => this.plugin.player.next());

		const times = now.createDiv({ cls: "vault-caster-times" });
		this.currentEl = times.createSpan({ cls: "vault-caster-current", text: formatTime(0) });
		this.seek = times.createEl("input", {
			type: "range",
			cls: "vault-caster-seek",
			attr: {
				min: "0",
				max: "0",
				step: "0.1",
				value: "0",
				"aria-label": "Position",
				"aria-valuetext": formatTime(0),
			},
		});
		this.durationEl = times.createSpan({ cls: "vault-caster-duration", text: formatTime(0) });
		this.bindSeek(this.seek);

		const options = now.createDiv({ cls: "vault-caster-options" });
		const speedId = `${viewId}-speed`;
		const speedLabel = options.createEl("label", { cls: "vault-caster-speed", attr: { for: speedId } });
		speedLabel.createSpan({ text: "Speed" });
		this.speed = speedLabel.createEl("select", { attr: { id: speedId } });
		for (const value of SPEEDS) {
			this.speed.createEl("option", { text: `${value}×`, attr: { value: String(value) } });
		}
		this.speed.addEventListener("change", () => {
			if (!this.speed) return;
			this.plugin.player.setSpeed(Number(this.speed.value));
		});

		const volumeId = `${viewId}-volume`;
		const volumeLabel = options.createEl("label", { cls: "vault-caster-volume", attr: { for: volumeId } });
		volumeLabel.createSpan({ text: "Volume" });
		this.volume = volumeLabel.createEl("input", {
			type: "range",
			attr: {
				id: volumeId,
				min: "0",
				max: "1",
				step: "0.01",
				value: "1",
				"aria-valuetext": "100 percent",
			},
		});
		this.volume.addEventListener("input", () => {
			if (!this.volume) return;
			this.plugin.player.setVolume(Number(this.volume.value));
			this.volume.setAttribute("aria-valuetext", `${Math.round(Number(this.volume.value) * 100)} percent`);
		});

		this.coursesEl = root.createDiv({ cls: "vault-caster-courses" });
		this.unsubscribe = this.plugin.player.subscribe((kind) => {
			if (kind === "clock") this.updateClock();
			else this.updateTransport();
		});
		this.render();
	}

	async onClose(): Promise<void> {
		this.unsubscribe?.();
		this.unsubscribe = null;
		this.rows.clear();
		this.courseCounts = [];
		this.nowTitle = null;
		this.playButton = null;
		this.currentEl = null;
		this.durationEl = null;
		this.seek = null;
		this.speed = null;
		this.volume = null;
		this.coursesEl = null;
		this.contentEl.empty();
		this.contentEl.removeClass("vault-caster");
	}

	render(): void {
		this.renderList();
		this.updateTransport();
	}

	private renderList(): void {
		const list = this.coursesEl;
		if (!list) return;
		const scroll = list.scrollTop;
		list.empty();
		this.rows.clear();
		this.courseCounts = [];

		const courses = this.plugin.courses;
		if (courses.length === 0) {
			list.createDiv({ cls: "vault-caster-empty", text: "No episodes under Podcast/audio" });
			return;
		}

		const current = this.plugin.player.data.lastPath;
		for (const course of courses) {
			const section = list.createEl("section", { cls: "vault-caster-course" });
			const heading = section.createEl("h3", { cls: "vault-caster-course-name" });
			heading.createSpan({ text: course.courseName });
			const count = heading.createSpan({ cls: "vault-caster-count" });
			this.courseCounts.push({ el: count, episodes: course.episodes });
			for (const item of course.episodes) this.renderEpisode(section, item, current);
		}
		this.updateMarks();
		list.scrollTop = scroll;
	}

	private renderEpisode(parent: HTMLElement, episode: Episode, current: string | null): void {
		const row = parent.createDiv({
			cls: `vault-caster-row${episode.path === current ? " is-current" : ""}`,
		});
		const label = this.plugin.labelFor(episode);
		const play = row.createEl("button", {
			cls: "vault-caster-play",
			attr: { type: "button", "aria-label": label },
		});
		play.addEventListener("click", () => this.plugin.player.load(episode.path, true));
		const mark = play.createSpan({ cls: "vault-caster-mark" });
		play.createSpan({ cls: "vault-caster-label", text: label });
		this.rows.set(episode.path, { row, play, mark });

		if (episode.notePath) {
			const notePath = episode.notePath;
			const note = row.createEl("button", {
				cls: "vault-caster-note",
				attr: { type: "button", "aria-label": "Open script" },
			});
			this.placeIcon(note, "file-text");
			note.addEventListener("click", () => {
				void this.plugin.openNote(notePath);
			});
		}
	}

	private updateTransport(): void {
		if (!this.nowTitle || !this.playButton || !this.speed || !this.volume) return;
		this.syncTitle();
		this.syncPlayButton();
		this.syncOptions();
		this.updateClock();
		this.updateMarks();
	}

	private syncTitle(): void {
		if (!this.nowTitle) return;
		const path = this.plugin.player.data.lastPath;
		const episode = path ? this.plugin.episodeByPath(path) : null;
		const text = episode
			? this.plugin.labelFor(episode)
			: path
				? this.plugin.fallbackLabel(path)
				: "No episode selected";
		if (this.nowTitle.textContent !== text) this.nowTitle.setText(text);
	}

	private syncPlayButton(): void {
		const button = this.playButton;
		if (!button) return;
		const { player } = this.plugin;
		const playing = Boolean(player.audio.currentSrc) && !player.audio.paused;
		const label = playing ? "Pause" : "Play";
		const icon = playing ? "pause" : "play";
		if (button.getAttribute("aria-label") === label && button.dataset.icon === icon) return;
		button.setAttribute("aria-label", label);
		button.dataset.icon = icon;
		button.empty();
		this.placeIcon(button, icon);
	}

	private syncOptions(): void {
		const { speed, volume } = this;
		if (!speed || !volume) return;
		const { player } = this.plugin;
		const speedValue = String(player.data.speed);
		if (document.activeElement !== speed && speed.value !== speedValue) speed.value = speedValue;
		const volumeValue = String(player.data.volume);
		if (document.activeElement !== volume && volume.value !== volumeValue) {
			volume.value = volumeValue;
			volume.setAttribute("aria-valuetext", `${Math.round(player.data.volume * 100)} percent`);
		}
	}

	private updateMarks(): void {
		const current = this.plugin.player.data.lastPath;
		for (const [path, refs] of this.rows) {
			const episode = this.plugin.episodeByPath(path);
			if (!episode) continue;
			refs.row.toggleClass("is-current", path === current);
			const state = this.plugin.player.data.tracks[path];
			const percent = progressPercent(state?.position ?? 0, state?.duration ?? 0, false);
			const finished = Boolean(state?.finished);
			const status = finished ? "Finished" : percent != null ? `${percent} percent` : "";
			const label = this.plugin.labelFor(episode);
			const name = status ? `${status}. ${label}` : label;
			if (refs.play.getAttribute("aria-label") !== name) refs.play.setAttribute("aria-label", name);
			if (finished) {
				if (!refs.mark.querySelector("svg")) {
					refs.mark.empty();
					this.placeIcon(refs.mark, "check");
				}
			} else {
				const markText = percent == null ? "" : `${percent}%`;
				if (refs.mark.querySelector("svg") || refs.mark.textContent !== markText) {
					refs.mark.empty();
					refs.mark.setText(markText);
				}
			}
		}
		for (const item of this.courseCounts) {
			const done = item.episodes.filter((episode) => this.plugin.player.data.tracks[episode.path]?.finished).length;
			const text = `${done}/${item.episodes.length}`;
			if (item.el.textContent !== text) item.el.setText(text);
		}
	}

	private updateClock(): void {
		if (!this.currentEl || !this.durationEl || !this.seek) return;
		const seconds = this.currentSeconds();
		const length = this.durationSeconds();
		const currentText = formatTime(seconds);
		const durationText = formatTime(length);
		if (this.currentEl.textContent !== currentText) this.currentEl.setText(currentText);
		if (this.durationEl.textContent !== durationText) this.durationEl.setText(durationText);
		if (this.seeking) return;
		this.seek.max = String(length || 0);
		this.seek.disabled = length <= 0;
		this.seek.value = String(seconds);
		const valueText = length <= 0 ? currentText : `${currentText} of ${durationText}`;
		if (this.seek.getAttribute("aria-valuetext") !== valueText) this.seek.setAttribute("aria-valuetext", valueText);
	}

	private bindSeek(seek: HTMLInputElement): void {
		const stop = () => {
			this.seeking = false;
		};
		seek.addEventListener("pointerdown", () => {
			this.seeking = true;
		});
		seek.addEventListener("pointerup", stop);
		seek.addEventListener("pointercancel", stop);
		seek.addEventListener("change", stop);
		seek.addEventListener("input", () => {
			this.plugin.player.seek(Number(seek.value));
			this.updateClock();
		});
	}

	private currentSeconds(): number {
		const { player } = this.plugin;
		if (player.audio.currentSrc && Number.isFinite(player.audio.currentTime)) return player.audio.currentTime;
		const path = player.data.lastPath;
		return path ? (player.data.tracks[path]?.position ?? 0) : 0;
	}

	private durationSeconds(): number {
		const { player } = this.plugin;
		if (player.audio.currentSrc && Number.isFinite(player.audio.duration)) return player.audio.duration;
		const path = player.data.lastPath;
		return path ? (player.data.tracks[path]?.duration ?? 0) : 0;
	}

	private iconButton(parent: HTMLElement, icon: string, label: string, onClick: () => void): HTMLButtonElement {
		const button = parent.createEl("button", {
			cls: "vault-caster-icon",
			attr: { type: "button", "aria-label": label },
		});
		button.dataset.icon = icon;
		this.placeIcon(button, icon);
		button.addEventListener("click", onClick);
		return button;
	}

	private placeIcon(parent: HTMLElement, name: string): void {
		setIcon(parent, name);
		parent.querySelector("svg")?.setAttribute("aria-hidden", "true");
	}
}
