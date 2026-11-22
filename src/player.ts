import {
	forgetPath,
	isFinished,
	moveTrackKeys,
	neighborPath,
	normalizeData,
	normalizeSpeed,
	resumePosition,
	type Course,
	type Persisted,
} from "./library.ts";

export type PlayerEvent = "clock" | "structure";
export type PlayerListener = (kind: PlayerEvent) => void;

export interface PlayerHost {
	courses: () => Course[];
	resolveSrc: (path: string) => string | null;
	write: (data: Persisted) => Promise<void> | void;
	onError: (message: string) => void;
}

const SAVE_MS = 5000;

export class Player {
	data: Persisted;
	readonly audio: HTMLAudioElement;
	private host: PlayerHost;
	private listeners = new Set<PlayerListener>();
	private loadToken = 0;
	private pending: { token: number; path: string; play: boolean } | null = null;
	private mediaReady = false;
	private suppressError = false;
	private disposed = false;
	private saveTimer: ReturnType<typeof setTimeout> | null = null;
	private saveChain: Promise<void> = Promise.resolve();

	constructor(raw: unknown, host: PlayerHost, audio?: HTMLAudioElement) {
		this.data = normalizeData(raw);
		this.host = host;
		this.audio = audio ?? new Audio();
		this.audio.preload = "metadata";
		this.audio.volume = this.data.volume;
		this.audio.playbackRate = this.data.speed;
		this.audio.addEventListener("loadedmetadata", () => this.onMetadata());
		this.audio.addEventListener("timeupdate", () => this.onTime());
		this.audio.addEventListener("seeked", () => this.onSeeked());
		this.audio.addEventListener("pause", () => this.onPause());
		this.audio.addEventListener("play", () => this.emit("structure"));
		this.audio.addEventListener("ended", () => this.onEnded());
		this.audio.addEventListener("error", () => this.onAudioError());
	}

	subscribe(listener: PlayerListener): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	restore(): void {
		const path = this.data.lastPath;
		if (!path || !this.host.resolveSrc(path)) return;
		this.load(path, false);
	}

	load(path: string, play: boolean): void {
		const src = this.host.resolveSrc(path);
		if (!src) {
			this.host.onError("VaultCaster could not find that episode.");
			return;
		}
		this.capture();
		this.mediaReady = false;
		this.suppressError = false;
		const token = ++this.loadToken;
		this.pending = { token, path, play };
		if (!this.data.tracks[path]) {
			this.data.tracks[path] = { position: 0, duration: 0, finished: false };
		}
		this.data.lastPath = path;
		this.audio.pause();
		this.audio.src = src;
		this.audio.volume = this.data.volume;
		this.audio.playbackRate = this.data.speed;
		void this.persist(true);
		this.emit("structure");
	}

	toggle(): void {
		if (!this.data.lastPath) {
			const first = this.host.courses()[0]?.episodes[0]?.path;
			if (first) this.load(first, true);
			return;
		}
		if (!this.audio.currentSrc) {
			this.load(this.data.lastPath, true);
			return;
		}
		if (this.audio.paused) {
			void this.audio.play().catch(() => {
				this.host.onError("VaultCaster could not start playback.");
			});
			return;
		}
		this.audio.pause();
	}

	next(): void {
		this.step(1);
	}

	previous(): void {
		this.step(-1);
	}

	setSpeed(speed: number): void {
		this.data.speed = normalizeSpeed(speed);
		this.audio.playbackRate = this.data.speed;
		void this.persist(true);
	}

	setVolume(volume: number): void {
		const next = Number.isFinite(volume) ? Math.min(1, Math.max(0, volume)) : this.data.volume;
		this.data.volume = next;
		this.audio.volume = next;
		void this.persist(true);
	}

	seek(seconds: number): void {
		if (!this.mediaReady || !Number.isFinite(this.audio.duration)) return;
		const duration = this.audio.duration;
		this.audio.currentTime = Math.min(duration, Math.max(0, seconds));
	}

	remap(oldPath: string, newPath: string): void {
		moveTrackKeys(this.data, oldPath, newPath);
		void this.persist(true);
		this.emit("structure");
	}

	forget(path: string): void {
		const current = this.data.lastPath;
		const playingThis =
			current === path || (current != null && current.startsWith(path.endsWith("/") ? path : `${path}/`));
		if (!forgetPath(this.data, path)) return;
		if (playingThis) this.stopElement();
		void this.persist(true);
		this.emit("structure");
	}

	flush(): Promise<void> {
		return this.persist(true);
	}

	dispose(): void {
		this.disposed = true;
		this.audio.pause();
		this.stopElement();
		void this.persist(true);
	}

	private step(delta: number): void {
		const path = this.data.lastPath;
		if (!path) return;
		const target = neighborPath(this.host.courses(), path, delta);
		if (!target) {
			if (delta < 0 && this.mediaReady) this.audio.currentTime = 0;
			return;
		}
		this.load(target, !this.audio.paused);
	}

	private onMetadata(): void {
		const pending = this.pending;
		if (!pending || pending.token !== this.loadToken) return;
		const state = this.data.tracks[pending.path];
		if (!state) return;
		const duration = this.audio.duration;
		state.duration = Number.isFinite(duration) ? duration : 0;
		const start = resumePosition(state.position, state.duration);
		state.position = start;
		this.mediaReady = true;
		if (start > 0 && Math.abs(this.audio.currentTime - start) > 0.25) {
			this.audio.currentTime = start;
		}
		if (pending.play) {
			void this.audio.play().catch(() => {
				this.host.onError("VaultCaster could not start playback.");
			});
		}
		void this.persist(true);
		this.emit("structure");
	}

	private onTime(): void {
		if (!this.mediaReady) return;
		const path = this.data.lastPath;
		const state = path ? this.data.tracks[path] : undefined;
		if (!path || !state) return;
		const position = this.audio.currentTime;
		if (!Number.isFinite(position)) return;
		state.position = position;
		if (Number.isFinite(this.audio.duration) && this.audio.duration > 0) {
			state.duration = this.audio.duration;
		}
		const finished = isFinished(position, state.duration, state.finished);
		const flipped = finished !== state.finished;
		state.finished = finished;
		this.scheduleSave();
		this.emit(flipped ? "structure" : "clock");
	}

	private onSeeked(): void {
		if (!this.mediaReady) return;
		this.onTime();
		void this.persist(true);
	}

	private onPause(): void {
		if (!this.mediaReady) return;
		this.onTime();
		void this.persist(true);
		this.emit("structure");
	}

	private onEnded(): void {
		const path = this.data.lastPath;
		if (!path) return;
		const state = this.data.tracks[path];
		if (state) {
			state.finished = true;
			state.position = 0;
		}
		const next = neighborPath(this.host.courses(), path, 1);
		this.mediaReady = false;
		void this.persist(true);
		if (next) {
			this.load(next, true);
			return;
		}
		if (Number.isFinite(this.audio.duration)) this.audio.currentTime = 0;
		this.mediaReady = true;
		this.emit("structure");
	}

	private onAudioError(): void {
		if (this.disposed || this.suppressError || !this.audio.currentSrc) return;
		this.host.onError("VaultCaster could not play that episode.");
	}

	private capture(): void {
		if (!this.mediaReady || !this.data.lastPath) return;
		const state = this.data.tracks[this.data.lastPath];
		if (!state) return;
		const position = this.audio.currentTime;
		if (!Number.isFinite(position)) return;
		state.position = position;
		const duration = Number.isFinite(this.audio.duration) ? this.audio.duration : state.duration;
		state.finished = isFinished(position, duration, state.finished);
	}

	private stopElement(): void {
		this.mediaReady = false;
		this.suppressError = true;
		this.pending = null;
		this.loadToken++;
		this.audio.pause();
		this.audio.removeAttribute("src");
		this.audio.load();
	}

	private scheduleSave(): void {
		if (this.saveTimer) return;
		this.saveTimer = setTimeout(() => {
			this.saveTimer = null;
			void this.persist(true);
		}, SAVE_MS);
	}

	private persist(immediate: boolean): Promise<void> {
		if (!immediate) {
			this.scheduleSave();
			return Promise.resolve();
		}
		if (this.saveTimer) {
			clearTimeout(this.saveTimer);
			this.saveTimer = null;
		}
		const snapshot = structuredClone(this.data);
		this.saveChain = this.saveChain
			.then(() => this.host.write(snapshot))
			.then(() => undefined)
			.catch(() => undefined);
		return this.saveChain;
	}

	private emit(kind: PlayerEvent): void {
		for (const listener of this.listeners) listener(kind);
	}
}
