import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Course } from "./library.ts";
import { Player } from "./player.ts";

class FakeAudio extends EventTarget {
	preload = "";
	volume = 1;
	playbackRate = 1;
	paused = true;
	currentTime = 0;
	duration = 100;
	currentSrc = "";
	#src = "";

	get src(): string {
		return this.#src;
	}

	set src(value: string) {
		this.#src = value;
		this.currentSrc = value;
		this.currentTime = 0;
		this.paused = true;
		queueMicrotask(() => this.dispatchEvent(new Event("loadedmetadata")));
	}

	play(): Promise<void> {
		this.paused = false;
		this.dispatchEvent(new Event("play"));
		return Promise.resolve();
	}

	pause(): void {
		const wasPaused = this.paused;
		this.paused = true;
		if (!wasPaused) this.dispatchEvent(new Event("pause"));
	}

	load(): void {
		this.currentSrc = "";
	}

	removeAttribute(name: string): void {
		if (name === "src") {
			this.#src = "";
			this.currentSrc = "";
		}
	}
}

function course(): Course {
	return {
		coursePath: "Course",
		courseName: "Course",
		episodes: [
			{
				path: "Course/Podcast/audio/E01-One.mp3",
				basename: "E01-One",
				coursePath: "Course",
				courseName: "Course",
				notePath: null,
			},
			{
				path: "Course/Podcast/audio/E02-Two.mp3",
				basename: "E02-Two",
				coursePath: "Course",
				courseName: "Course",
				notePath: null,
			},
		],
	};
}

describe("player", () => {
	it("seeks to the saved position after metadata and restarts a finished episode", async () => {
		const audio = new FakeAudio();
		const player = new Player(
			{
				speed: 1,
				volume: 1,
				lastPath: null,
				tracks: {
					"Course/Podcast/audio/E01-One.mp3": { position: 40, duration: 100, finished: false },
					"Course/Podcast/audio/E02-Two.mp3": { position: 96, duration: 100, finished: true },
				},
			},
			{
				courses: () => [course()],
				resolveSrc: (path) => `app://${path}`,
				write: () => undefined,
				onError: () => undefined,
			},
			audio as unknown as HTMLAudioElement,
		);
		player.load("Course/Podcast/audio/E01-One.mp3", false);
		await new Promise((resolve) => setTimeout(resolve, 0));
		assert.equal(audio.currentTime, 40);

		player.load("Course/Podcast/audio/E02-Two.mp3", false);
		await new Promise((resolve) => setTimeout(resolve, 0));
		assert.equal(audio.currentTime, 0);
		assert.equal(player.data.tracks["Course/Podcast/audio/E02-Two.mp3"].finished, true);
	});

	it("marks an ended episode finished at position 0 and starts the next one", async () => {
		const audio = new FakeAudio();
		const player = new Player(
			{ speed: 1, volume: 1, lastPath: null, tracks: {} },
			{
				courses: () => [course()],
				resolveSrc: (path) => `app://${path}`,
				write: () => undefined,
				onError: () => undefined,
			},
			audio as unknown as HTMLAudioElement,
		);

		player.load("Course/Podcast/audio/E01-One.mp3", true);
		await new Promise((resolve) => setTimeout(resolve, 0));
		audio.currentTime = 100;
		audio.dispatchEvent(new Event("ended"));
		assert.equal(player.data.tracks["Course/Podcast/audio/E01-One.mp3"].finished, true);
		assert.equal(player.data.tracks["Course/Podcast/audio/E01-One.mp3"].position, 0);
		assert.equal(player.data.lastPath, "Course/Podcast/audio/E02-Two.mp3");
	});
});
