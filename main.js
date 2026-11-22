"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/main.ts
var main_exports = {};
__export(main_exports, {
  default: () => VaultCasterPlugin
});
module.exports = __toCommonJS(main_exports);
var import_obsidian2 = require("obsidian");

// src/library.ts
var AUDIO_EXTENSIONS = /* @__PURE__ */ new Set([
  "mp3",
  "m4a",
  "wav",
  "ogg",
  "flac",
  "aac",
  "opus"
]);
var SPEEDS = [1, 1.25, 1.5, 1.75, 2];
var AUDIO_MARKER = "/Podcast/audio/";
function courseFromAudioPath(path) {
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
function basenameOf(path) {
  const file = path.slice(path.lastIndexOf("/") + 1);
  const dot = file.lastIndexOf(".");
  return dot > 0 ? file.slice(0, dot) : file;
}
function scriptPathForEpisode(episodePath) {
  const course = courseFromAudioPath(episodePath);
  if (!course) return null;
  return `${course.coursePath}/Podcast/scripts/${basenameOf(episodePath)}.md`;
}
function naturalCompare(a, b) {
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
function buildLibrary(files, noteExists) {
  const courses = /* @__PURE__ */ new Map();
  for (const file of files) {
    if (!AUDIO_EXTENSIONS.has(file.extension.toLowerCase())) continue;
    const course = courseFromAudioPath(file.path);
    if (!course) continue;
    const note = scriptPathForEpisode(file.path);
    const episode = {
      path: file.path,
      basename: basenameOf(file.path),
      coursePath: course.coursePath,
      courseName: course.courseName,
      notePath: note && noteExists(note) ? note : null
    };
    let bucket = courses.get(course.coursePath);
    if (!bucket) {
      bucket = {
        coursePath: course.coursePath,
        courseName: course.courseName,
        episodes: []
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
function neighborPath(courses, path, delta) {
  for (const course of courses) {
    const index = course.episodes.findIndex((episode) => episode.path === path);
    if (index < 0) continue;
    return course.episodes[index + delta]?.path ?? null;
  }
  return null;
}
function episodeToken(basename, episode) {
  const match = /^(e\d+)/i.exec(basename);
  if (match) return match[1].toUpperCase();
  if (episode == null || !Number.isFinite(episode)) return null;
  return `E${String(Math.trunc(episode)).padStart(2, "0")}`;
}
function frontmatterTitle(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
function frontmatterEpisode(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && /^\d+$/.test(value.trim())) return Number(value.trim());
  return null;
}
function rowLabel(basename, title, episode) {
  const token = episodeToken(basename, episode);
  if (title && title.trim()) {
    return token ? `${token}  ${title.trim()}` : title.trim();
  }
  return basename.replace(/-/g, " ");
}
function isFinished(position, duration, wasFinished) {
  if (wasFinished) return true;
  if (!Number.isFinite(duration) || duration <= 0) return false;
  if (!Number.isFinite(position) || position < 0) return false;
  return position / duration >= 0.95;
}
function resumePosition(position, duration) {
  if (!Number.isFinite(position) || position < 0) return 0;
  if (!Number.isFinite(duration) || duration <= 0) return position;
  if (position / duration >= 0.95) return 0;
  return position;
}
function progressPercent(position, duration, finished) {
  if (finished) return null;
  if (!Number.isFinite(duration) || duration <= 0) return null;
  if (!Number.isFinite(position) || position <= 0) return null;
  return Math.min(99, Math.round(position / duration * 100));
}
function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) seconds = 0;
  const whole = Math.floor(seconds);
  const hours = Math.floor(whole / 3600);
  const minutes = Math.floor(whole % 3600 / 60);
  const rest = whole % 60;
  const pad = (value) => String(value).padStart(2, "0");
  if (hours > 0) return `${hours}:${pad(minutes)}:${pad(rest)}`;
  return `${minutes}:${pad(rest)}`;
}
function remapPath(path, oldPath, newPath) {
  if (path === oldPath) return newPath;
  const prefix = oldPath.endsWith("/") ? oldPath : `${oldPath}/`;
  if (path.startsWith(prefix)) return `${newPath}${path.slice(oldPath.length)}`;
  return path;
}
function defaultData() {
  return { speed: 1, volume: 1, lastPath: null, tracks: {} };
}
function normalizeSpeed(value) {
  const speed = typeof value === "number" ? value : Number(value);
  return SPEEDS.includes(speed) ? speed : 1;
}
function normalizeData(raw) {
  const data = defaultData();
  if (!raw || typeof raw !== "object") return data;
  const source = raw;
  data.speed = normalizeSpeed(source.speed);
  if (typeof source.volume === "number" && Number.isFinite(source.volume)) {
    data.volume = Math.min(1, Math.max(0, source.volume));
  }
  if (typeof source.lastPath === "string" && source.lastPath) data.lastPath = source.lastPath;
  if (source.tracks && typeof source.tracks === "object") {
    for (const [path, state] of Object.entries(source.tracks)) {
      if (!state || typeof state !== "object") continue;
      const track = state;
      data.tracks[path] = {
        position: typeof track.position === "number" && track.position > 0 ? track.position : 0,
        duration: typeof track.duration === "number" && track.duration > 0 ? track.duration : 0,
        finished: track.finished === true
      };
    }
  }
  return data;
}
function moveTrackKeys(data, oldPath, newPath) {
  if (oldPath === newPath) return;
  const tracks = {};
  for (const [path, state] of Object.entries(data.tracks)) {
    tracks[remapPath(path, oldPath, newPath)] = state;
  }
  data.tracks = tracks;
  if (data.lastPath) data.lastPath = remapPath(data.lastPath, oldPath, newPath);
}
function forgetPath(data, path) {
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

// src/player.ts
var SAVE_MS = 5e3;
var Player = class {
  data;
  audio;
  host;
  listeners = /* @__PURE__ */ new Set();
  loadToken = 0;
  pending = null;
  mediaReady = false;
  suppressError = false;
  disposed = false;
  saveTimer = null;
  saveChain = Promise.resolve();
  constructor(raw, host, audio) {
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
  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  restore() {
    const path = this.data.lastPath;
    if (!path || !this.host.resolveSrc(path)) return;
    this.load(path, false);
  }
  load(path, play) {
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
  toggle() {
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
  next() {
    this.step(1);
  }
  previous() {
    this.step(-1);
  }
  setSpeed(speed) {
    this.data.speed = normalizeSpeed(speed);
    this.audio.playbackRate = this.data.speed;
    void this.persist(true);
  }
  setVolume(volume) {
    const next = Number.isFinite(volume) ? Math.min(1, Math.max(0, volume)) : this.data.volume;
    this.data.volume = next;
    this.audio.volume = next;
    void this.persist(true);
  }
  seek(seconds) {
    if (!this.mediaReady || !Number.isFinite(this.audio.duration)) return;
    const duration = this.audio.duration;
    this.audio.currentTime = Math.min(duration, Math.max(0, seconds));
  }
  remap(oldPath, newPath) {
    moveTrackKeys(this.data, oldPath, newPath);
    void this.persist(true);
    this.emit("structure");
  }
  forget(path) {
    const current = this.data.lastPath;
    const playingThis = current === path || current != null && current.startsWith(path.endsWith("/") ? path : `${path}/`);
    if (!forgetPath(this.data, path)) return;
    if (playingThis) this.stopElement();
    void this.persist(true);
    this.emit("structure");
  }
  flush() {
    return this.persist(true);
  }
  dispose() {
    this.disposed = true;
    this.audio.pause();
    this.stopElement();
    void this.persist(true);
  }
  step(delta) {
    const path = this.data.lastPath;
    if (!path) return;
    const target = neighborPath(this.host.courses(), path, delta);
    if (!target) {
      if (delta < 0 && this.mediaReady) this.audio.currentTime = 0;
      return;
    }
    this.load(target, !this.audio.paused);
  }
  onMetadata() {
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
  onTime() {
    if (!this.mediaReady) return;
    const path = this.data.lastPath;
    const state = path ? this.data.tracks[path] : void 0;
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
  onSeeked() {
    if (!this.mediaReady) return;
    this.onTime();
    void this.persist(true);
  }
  onPause() {
    if (!this.mediaReady) return;
    this.onTime();
    void this.persist(true);
    this.emit("structure");
  }
  onEnded() {
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
  onAudioError() {
    if (this.disposed || this.suppressError || !this.audio.currentSrc) return;
    this.host.onError("VaultCaster could not play that episode.");
  }
  capture() {
    if (!this.mediaReady || !this.data.lastPath) return;
    const state = this.data.tracks[this.data.lastPath];
    if (!state) return;
    const position = this.audio.currentTime;
    if (!Number.isFinite(position)) return;
    state.position = position;
    const duration = Number.isFinite(this.audio.duration) ? this.audio.duration : state.duration;
    state.finished = isFinished(position, duration, state.finished);
  }
  stopElement() {
    this.mediaReady = false;
    this.suppressError = true;
    this.pending = null;
    this.loadToken++;
    this.audio.pause();
    this.audio.removeAttribute("src");
    this.audio.load();
  }
  scheduleSave() {
    if (this.saveTimer) return;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      void this.persist(true);
    }, SAVE_MS);
  }
  persist(immediate) {
    if (!immediate) {
      this.scheduleSave();
      return Promise.resolve();
    }
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    const snapshot = structuredClone(this.data);
    this.saveChain = this.saveChain.then(() => this.host.write(snapshot)).then(() => void 0).catch(() => void 0);
    return this.saveChain;
  }
  emit(kind) {
    for (const listener of this.listeners) listener(kind);
  }
};

// src/view.ts
var import_obsidian = require("obsidian");
var VIEW_TYPE = "vault-caster";
var nextViewId = 0;
var VaultCasterView = class extends import_obsidian.ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
  }
  seeking = false;
  unsubscribe = null;
  nowTitle = null;
  playButton = null;
  currentEl = null;
  durationEl = null;
  seek = null;
  speed = null;
  volume = null;
  coursesEl = null;
  rows = /* @__PURE__ */ new Map();
  courseCounts = [];
  getViewType() {
    return VIEW_TYPE;
  }
  getDisplayText() {
    return "VaultCaster";
  }
  getIcon() {
    return "headphones";
  }
  async onOpen() {
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
        "aria-valuetext": formatTime(0)
      }
    });
    this.durationEl = times.createSpan({ cls: "vault-caster-duration", text: formatTime(0) });
    this.bindSeek(this.seek);
    const options = now.createDiv({ cls: "vault-caster-options" });
    const speedId = `${viewId}-speed`;
    const speedLabel = options.createEl("label", { cls: "vault-caster-speed", attr: { for: speedId } });
    speedLabel.createSpan({ text: "Speed" });
    this.speed = speedLabel.createEl("select", { attr: { id: speedId } });
    for (const value of SPEEDS) {
      this.speed.createEl("option", { text: `${value}\xD7`, attr: { value: String(value) } });
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
        "aria-valuetext": "100 percent"
      }
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
  async onClose() {
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
  render() {
    this.renderList();
    this.updateTransport();
  }
  renderList() {
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
  renderEpisode(parent, episode, current) {
    const row = parent.createDiv({
      cls: `vault-caster-row${episode.path === current ? " is-current" : ""}`
    });
    const label = this.plugin.labelFor(episode);
    const play = row.createEl("button", {
      cls: "vault-caster-play",
      attr: { type: "button", "aria-label": label }
    });
    play.addEventListener("click", () => this.plugin.player.load(episode.path, true));
    const mark = play.createSpan({ cls: "vault-caster-mark" });
    play.createSpan({ cls: "vault-caster-label", text: label });
    this.rows.set(episode.path, { row, play, mark });
    if (episode.notePath) {
      const notePath = episode.notePath;
      const note = row.createEl("button", {
        cls: "vault-caster-note",
        attr: { type: "button", "aria-label": "Open script" }
      });
      this.placeIcon(note, "file-text");
      note.addEventListener("click", () => {
        void this.plugin.openNote(notePath);
      });
    }
  }
  updateTransport() {
    if (!this.nowTitle || !this.playButton || !this.speed || !this.volume) return;
    this.syncTitle();
    this.syncPlayButton();
    this.syncOptions();
    this.updateClock();
    this.updateMarks();
  }
  syncTitle() {
    if (!this.nowTitle) return;
    const path = this.plugin.player.data.lastPath;
    const episode = path ? this.plugin.episodeByPath(path) : null;
    const text = episode ? this.plugin.labelFor(episode) : path ? this.plugin.fallbackLabel(path) : "No episode selected";
    if (this.nowTitle.textContent !== text) this.nowTitle.setText(text);
  }
  syncPlayButton() {
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
  syncOptions() {
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
  updateMarks() {
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
  updateClock() {
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
  bindSeek(seek) {
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
  currentSeconds() {
    const { player } = this.plugin;
    if (player.audio.currentSrc && Number.isFinite(player.audio.currentTime)) return player.audio.currentTime;
    const path = player.data.lastPath;
    return path ? player.data.tracks[path]?.position ?? 0 : 0;
  }
  durationSeconds() {
    const { player } = this.plugin;
    if (player.audio.currentSrc && Number.isFinite(player.audio.duration)) return player.audio.duration;
    const path = player.data.lastPath;
    return path ? player.data.tracks[path]?.duration ?? 0 : 0;
  }
  iconButton(parent, icon, label, onClick) {
    const button = parent.createEl("button", {
      cls: "vault-caster-icon",
      attr: { type: "button", "aria-label": label }
    });
    button.dataset.icon = icon;
    this.placeIcon(button, icon);
    button.addEventListener("click", onClick);
    return button;
  }
  placeIcon(parent, name) {
    (0, import_obsidian.setIcon)(parent, name);
    parent.querySelector("svg")?.setAttribute("aria-hidden", "true");
  }
};

// src/main.ts
var VaultCasterPlugin = class extends import_obsidian2.Plugin {
  player;
  courses = [];
  status;
  statusText = null;
  refreshTimer = null;
  async onload() {
    const stored = await this.loadData();
    this.player = new Player(stored, {
      courses: () => this.courses,
      resolveSrc: (path) => this.resourcePath(path),
      write: (data) => this.saveData(data),
      onError: (message) => new import_obsidian2.Notice(message)
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
          new import_obsidian2.Notice("VaultCaster could not find a script for this episode.");
          return;
        }
        void this.openNote(episode.notePath);
      }
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
  async onWorkspaceReady() {
    await this.repairDock();
    this.refreshLibrary();
    this.player.restore();
    this.registerEvent(this.app.vault.on("create", () => this.queueRefresh()));
    this.registerEvent(
      this.app.vault.on("delete", (file) => {
        this.player.forget(file.path);
        this.queueRefresh();
      })
    );
    this.registerEvent(
      this.app.vault.on("rename", (file, oldPath) => {
        this.player.remap(oldPath, file.path);
        this.queueRefresh();
      })
    );
    this.registerEvent(
      this.app.metadataCache.on("changed", (file) => {
        if (file.path.includes("/Podcast/scripts/")) this.queueRefresh();
      })
    );
  }
  onunload() {
    if (this.refreshTimer) clearTimeout(this.refreshTimer);
    this.player.dispose();
  }
  async activateView() {
    await this.app.workspace.ensureSideLeaf(VIEW_TYPE, "right", {
      active: true,
      split: false,
      reveal: true
    });
  }
  /**
   * The first build opened a new tab group, which Obsidian shows as the lower
   * half of the sidebar. Move that lone leaf into the existing right-dock group
   * once. Playback lives on the plugin, so detaching the view does not stop audio.
   * Skip the flag when no leaf exists yet, so a later layout can still repair one.
   */
  async repairDock() {
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
        reveal: false
      });
    }
    this.app.saveLocalStorage(key, "1");
  }
  inRightDock(leaf) {
    const right = this.app.workspace.rightSplit;
    if (leaf.getRoot() === right) return true;
    let current = leaf.parent;
    for (let depth = 0; current && depth < 12; depth++) {
      if (current === right) return true;
      current = current.parent;
    }
    return false;
  }
  episodeByPath(path) {
    for (const course of this.courses) {
      const episode = course.episodes.find((item) => item.path === path);
      if (episode) return episode;
    }
    return null;
  }
  labelFor(episode) {
    const file = episode.notePath ? this.app.vault.getAbstractFileByPath(episode.notePath) : null;
    const frontmatter = file instanceof import_obsidian2.TFile ? this.app.metadataCache.getFileCache(file)?.frontmatter : void 0;
    return rowLabel(episode.basename, frontmatterTitle(frontmatter?.title), frontmatterEpisode(frontmatter?.episode));
  }
  fallbackLabel(path) {
    const file = path.slice(path.lastIndexOf("/") + 1);
    const dot = file.lastIndexOf(".");
    return (dot > 0 ? file.slice(0, dot) : file).replace(/-/g, " ");
  }
  async openNote(path) {
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof import_obsidian2.TFile)) {
      new import_obsidian2.Notice(`VaultCaster could not find ${path}`);
      return;
    }
    let existing = null;
    this.app.workspace.iterateAllLeaves((leaf2) => {
      const view = leaf2.view;
      if (view instanceof import_obsidian2.MarkdownView && view.file?.path === path) existing = leaf2;
    });
    if (existing) {
      await this.app.workspace.revealLeaf(existing);
      return;
    }
    const leaf = this.app.workspace.getLeaf("tab");
    await leaf.openFile(file);
  }
  refreshLibrary() {
    const files = this.app.vault.getFiles().map((file) => ({ path: file.path, extension: file.extension }));
    this.courses = buildLibrary(files, (path) => this.app.vault.getAbstractFileByPath(path) instanceof import_obsidian2.TFile);
    this.renderViews();
    this.updateStatus();
  }
  queueRefresh() {
    if (this.refreshTimer) clearTimeout(this.refreshTimer);
    this.refreshTimer = setTimeout(() => {
      this.refreshTimer = null;
      this.refreshLibrary();
    }, 200);
  }
  renderViews() {
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE)) {
      if (leaf.view instanceof VaultCasterView) leaf.view.render();
    }
  }
  resourcePath(path) {
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof import_obsidian2.TFile)) return null;
    return this.app.vault.getResourcePath(file);
  }
  updateStatus() {
    const path = this.player.data.lastPath;
    let text = "";
    if (path) {
      const episode = this.episodeByPath(path);
      const label = episode ? this.labelFor(episode).split("  ")[0] : this.fallbackLabel(path).split(" ")[0];
      const seconds = this.player.audio.currentSrc ? this.player.audio.currentTime : this.player.data.tracks[path]?.position ?? 0;
      text = `${label}  ${formatTime(seconds)}`;
    }
    if (text === this.statusText) return;
    this.statusText = text;
    this.status.style.display = text ? "" : "none";
    this.status.setText(text);
  }
};
