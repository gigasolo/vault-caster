import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
	buildLibrary,
	courseFromAudioPath,
	forgetPath,
	formatTime,
	isFinished,
	moveTrackKeys,
	naturalCompare,
	progressPercent,
	resumePosition,
	rowLabel,
	scriptPathForEpisode,
	type Persisted,
} from "./library.ts";

const episode = "GigaSolo/Learning/GTM-CRO-Crash-Course/Podcast/audio/E01-GTM-Fundamentals.mp3";

describe("course paths", () => {
	it("reads the course from a Podcast/audio file", () => {
		assert.deepEqual(courseFromAudioPath(episode), {
			coursePath: "GigaSolo/Learning/GTM-CRO-Crash-Course",
			courseName: "GTM-CRO-Crash-Course",
		});
	});

	it("ignores Meetings/audio", () => {
		assert.equal(courseFromAudioPath("Meetings/audio/1790364641.ogg"), null);
	});

	it("ignores audio nested under Podcast/audio", () => {
		assert.equal(
			courseFromAudioPath("Course/Podcast/audio/extra/E01-Nested.mp3"),
			null,
		);
	});
});

describe("scripts and labels", () => {
	it("points at the sibling scripts folder", () => {
		assert.equal(
			scriptPathForEpisode(episode),
			"GigaSolo/Learning/GTM-CRO-Crash-Course/Podcast/scripts/E01-GTM-Fundamentals.md",
		);
	});

	it("prefixes a frontmatter title with the episode token", () => {
		assert.equal(
			rowLabel("E10-Measurement-for-a-Tiny-Team", "Measurement for a tiny team", 10),
			"E10  Measurement for a tiny team",
		);
	});

	it("humanizes the filename when the title is missing", () => {
		assert.equal(rowLabel("E02-Founder-Led-Sales", null, null), "E02 Founder Led Sales");
	});
});

describe("library", () => {
	it("groups courses by full path, sorts episodes, and links an existing script", () => {
		const files = [
			{ path: "A/Same/Podcast/audio/E10-Late.mp3", extension: "mp3" },
			{ path: "A/Same/Podcast/audio/E02-Second.mp3", extension: "mp3" },
			{ path: "B/Same/Podcast/audio/E01-Other.mp3", extension: "mp3" },
			{ path: "Meetings/audio/1790364641.ogg", extension: "ogg" },
			{ path: "A/Same/Podcast/audio/notes.txt", extension: "txt" },
		];
		const notes = new Set(["A/Same/Podcast/scripts/E02-Second.md"]);
		const courses = buildLibrary(files, (path) => notes.has(path));
		assert.deepEqual(
			courses.map((course) => course.coursePath),
			["A/Same", "B/Same"],
		);
		assert.deepEqual(
			courses[0].episodes.map((item) => item.basename),
			["E02-Second", "E10-Late"],
		);
		assert.equal(courses[0].episodes[0].notePath, "A/Same/Podcast/scripts/E02-Second.md");
		assert.equal(courses[0].episodes[1].notePath, null);
	});

	it("sorts E02 before E10", () => {
		const names = ["E10-Late", "E02-Second", "E00-Trailer", "E01-First"];
		names.sort(naturalCompare);
		assert.deepEqual(names, ["E00-Trailer", "E01-First", "E02-Second", "E10-Late"]);
	});
});

describe("progress", () => {
	it("marks finished at 95 percent and keeps that mark", () => {
		assert.equal(isFinished(94, 100, false), false);
		assert.equal(isFinished(95, 100, false), true);
		assert.equal(isFinished(0, 100, true), true);
		assert.equal(isFinished(10, 0, false), false);
	});

	it("restarts a position that is already past 95 percent", () => {
		assert.equal(resumePosition(96, 100), 0);
		assert.equal(resumePosition(40, 100), 40);
	});

	it("hides the percent once an episode is finished", () => {
		assert.equal(progressPercent(40, 100, false), 40);
		assert.equal(progressPercent(40, 100, true), null);
		assert.equal(progressPercent(0, 100, false), null);
	});

	it("moves progress when a folder is renamed and drops it when the file is deleted", () => {
		const data: Persisted = {
			speed: 1,
			volume: 1,
			lastPath: "Learning/Course/Podcast/audio/E01-One.mp3",
			tracks: {
				"Learning/Course/Podcast/audio/E01-One.mp3": { position: 12, duration: 100, finished: true },
			},
		};
		moveTrackKeys(data, "Learning", "Study");
		assert.equal(data.lastPath, "Study/Course/Podcast/audio/E01-One.mp3");
		assert.equal(data.tracks["Study/Course/Podcast/audio/E01-One.mp3"].finished, true);
		assert.equal(forgetPath(data, "Study/Course/Podcast/audio/E01-One.mp3"), true);
		assert.equal(data.lastPath, null);
		assert.deepEqual(data.tracks, {});
	});

	it("formats a clock", () => {
		assert.equal(formatTime(65), "1:05");
		assert.equal(formatTime(3661), "1:01:01");
	});
});
