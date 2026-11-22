export const AUDIO_EXTENSIONS = new Set([
	"mp3",
	"m4a",
	"wav",
	"ogg",
	"flac",
	"aac",
	"opus",
]);

export const SPEEDS = [1, 1.25, 1.5, 1.75, 2] as const;

export interface CourseRef {
	coursePath: string;
	courseName: string;
}

export interface Episode {
	path: string;
	basename: string;
	coursePath: string;
	courseName: string;
	notePath: string | null;
}

export interface Course {
	coursePath: string;
	courseName: string;
	episodes: Episode[];
}

export interface FileRef {
	path: string;
	extension: string;
}

export interface TrackState {
	position: number;
	duration: number;
	finished: boolean;
}

export interface Persisted {
	speed: number;
	volume: number;
	lastPath: string | null;
	tracks: Record<string, TrackState>;
}

const AUDIO_MARKER = "/Podcast/audio/";

export function courseFromAudioPath(path: string): CourseRef | null {
	const idx = path.lastIndexOf(AUDIO_MARKER);
	if (idx <= 0) return null;
	const rest = path.slice(idx + AUDIO_MARKER.length);
	if (!rest || rest.includes("/")) return null;
	const coursePath = path.slice(0, idx);
	const slash = coursePath.lastIndexOf("/");
	const courseName = slash >= 0 ? coursePath.slice(slash + 1) : coursePath;
	if (!courseName) return null;
	return { coursePath, courseName };
}

export function basenameOf(path: string): string {
	const file = path.slice(path.lastIndexOf("/") + 1);
	const dot = file.lastIndexOf(".");
	return dot > 0 ? file.slice(0, dot) : file;
}

export function scriptPathForEpisode(episodePath: string): string | null {
	const course = courseFromAudioPath(episodePath);
	if (!course) return null;
	return `${course.coursePath}/Podcast/scripts/${basenameOf(episodePath)}.md`;
}

export function naturalCompare(a: string, b: string): number {
	const parts = /(\d+)|(\D+)/g;
	const as = a.match(parts) ?? [];
	const bs = b.match(parts) ?? [];
	const count = Math.max(as.length, bs.length);
	for (let i = 0; i < count; i++) {
		const x = as[i] ?? "";
		const y = bs[i] ?? "";
		const xn = /^\d+$/.test(x);
		const yn = /^\d+$/.test(y);
		if (xn && yn) {
			const diff = Number(x) - Number(y);
			if (diff !== 0) return diff;
		} else {
			const diff = x.localeCompare(y);
			if (diff !== 0) return diff;
		}
	}
	return a.localeCompare(b);
}

export function buildLibrary(files: FileRef[], noteExists: (path: string) => boolean): Course[] {
	const courses = new Map<string, Course>();
	for (const file of files) {
		if (!AUDIO_EXTENSIONS.has(file.extension.toLowerCase())) continue;
		const course = courseFromAudioPath(file.path);
		if (!course) continue;
		const note = scriptPathForEpisode(file.path);
		const episode: Episode = {
			path: file.path,
			basename: basenameOf(file.path),
			coursePath: course.coursePath,
			courseName: course.courseName,
			notePath: note && noteExists(note) ? note : null,
		};
		let bucket = courses.get(course.coursePath);
		if (!bucket) {
			bucket = {
				coursePath: course.coursePath,
				courseName: course.courseName,
				episodes: [],
			};
			courses.set(course.coursePath, bucket);
		}
		bucket.episodes.push(episode);
	}
	const list = [...courses.values()];
	list.sort((a, b) => naturalCompare(a.courseName, b.courseName) || a.coursePath.localeCompare(b.coursePath));
	for (const course of list) {
		course.episodes.sort((a, b) => naturalCompare(a.basename, b.basename));
	}
	return list;
}

export function neighborPath(courses: Course[], path: string, delta: number): string | null {
	for (const course of courses) {
		const index = course.episodes.findIndex((episode) => episode.path === path);
		if (index < 0) continue;
		return course.episodes[index + delta]?.path ?? null;
	}
	return null;
}

export function episodeToken(basename: string, episode: number | null): string | null {
	const match = /^(e\d+)/i.exec(basename);
	if (match) return match[1].toUpperCase();
	if (episode == null || !Number.isFinite(episode)) return null;
	return `E${String(Math.trunc(episode)).padStart(2, "0")}`;
}

export function frontmatterTitle(value: unknown): string | null {
	return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function frontmatterEpisode(value: unknown): number | null {
	if (typeof value === "number" && Number.isFinite(value)) return value;
	if (typeof value === "string" && /^\d+$/.test(value.trim())) return Number(value.trim());
	return null;
}

export function rowLabel(basename: string, title: string | null, episode: number | null): string {
	const token = episodeToken(basename, episode);
	if (title && title.trim()) {
		return token ? `${token}  ${title.trim()}` : title.trim();
	}
	return basename.replace(/-/g, " ");
}

export function isFinished(position: number, duration: number, wasFinished: boolean): boolean {
	if (wasFinished) return true;
	if (!Number.isFinite(duration) || duration <= 0) return false;
	if (!Number.isFinite(position) || position < 0) return false;
	return position / duration >= 0.95;
}

export function resumePosition(position: number, duration: number): number {
	if (!Number.isFinite(position) || position < 0) return 0;
	if (!Number.isFinite(duration) || duration <= 0) return position;
	if (position / duration >= 0.95) return 0;
	return position;
}

export function progressPercent(position: number, duration: number, finished: boolean): number | null {
	if (finished) return null;
	if (!Number.isFinite(duration) || duration <= 0) return null;
	if (!Number.isFinite(position) || position <= 0) return null;
	return Math.min(99, Math.round((position / duration) * 100));
}

export function formatTime(seconds: number): string {
	if (!Number.isFinite(seconds) || seconds < 0) seconds = 0;
	const whole = Math.floor(seconds);
	const hours = Math.floor(whole / 3600);
	const minutes = Math.floor((whole % 3600) / 60);
	const rest = whole % 60;
	const pad = (value: number) => String(value).padStart(2, "0");
	if (hours > 0) return `${hours}:${pad(minutes)}:${pad(rest)}`;
	return `${minutes}:${pad(rest)}`;
}

export function remapPath(path: string, oldPath: string, newPath: string): string {
	if (path === oldPath) return newPath;
	const prefix = oldPath.endsWith("/") ? oldPath : `${oldPath}/`;
	if (path.startsWith(prefix)) return `${newPath}${path.slice(oldPath.length)}`;
	return path;
}

export function defaultData(): Persisted {
	return { speed: 1, volume: 1, lastPath: null, tracks: {} };
}

export function normalizeSpeed(value: unknown): number {
	const speed = typeof value === "number" ? value : Number(value);
	return SPEEDS.includes(speed as (typeof SPEEDS)[number]) ? speed : 1;
}

export function normalizeData(raw: unknown): Persisted {
	const data = defaultData();
	if (!raw || typeof raw !== "object") return data;
	const source = raw as Partial<Persisted>;
	data.speed = normalizeSpeed(source.speed);
	if (typeof source.volume === "number" && Number.isFinite(source.volume)) {
		data.volume = Math.min(1, Math.max(0, source.volume));
	}
	if (typeof source.lastPath === "string" && source.lastPath) data.lastPath = source.lastPath;
	if (source.tracks && typeof source.tracks === "object") {
		for (const [path, state] of Object.entries(source.tracks)) {
			if (!state || typeof state !== "object") continue;
			const track = state as Partial<TrackState>;
			data.tracks[path] = {
				position: typeof track.position === "number" && track.position > 0 ? track.position : 0,
				duration: typeof track.duration === "number" && track.duration > 0 ? track.duration : 0,
				finished: track.finished === true,
			};
		}
	}
	return data;
}

export function moveTrackKeys(data: Persisted, oldPath: string, newPath: string): void {
	if (oldPath === newPath) return;
	const tracks: Record<string, TrackState> = {};
	for (const [path, state] of Object.entries(data.tracks)) {
		tracks[remapPath(path, oldPath, newPath)] = state;
	}
	data.tracks = tracks;
	if (data.lastPath) data.lastPath = remapPath(data.lastPath, oldPath, newPath);
}

export function forgetPath(data: Persisted, path: string): boolean {
	const prefix = path.endsWith("/") ? path : `${path}/`;
	let cleared = false;
	for (const key of Object.keys(data.tracks)) {
		if (key === path || key.startsWith(prefix)) {
			delete data.tracks[key];
			cleared = true;
		}
	}
	if (data.lastPath && (data.lastPath === path || data.lastPath.startsWith(prefix))) {
		data.lastPath = null;
		cleared = true;
	}
	return cleared;
}
