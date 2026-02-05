"use strict";

const fs = require("fs");
const path = require("path");
const https = require("https");
const crypto = require("crypto");
const AudioPlayer = require("./utils/audioPlayer");

const DEFAULT_CONFIG = {
    enabled: false,
    autoUpdateInstalled: false,
    cacheDir: "tts_cache",
    repo: {
        owner: "Minor-fun",
        name: "tera-guide-tts-cache",
        branch: "main"
    },
    selectedPack: null
};

const REMOTE_CACHE_TTL_MS = 2 * 60 * 1000;
const LOCAL_MANIFEST_FILE = ".tts_manifest.json";
const PREVIEW_DIR_NAME = "preview";

class OnlineTTS {
    /**
     * @param {Object} settings Configuration object
     * @param {string} settings.basePath Base path for cache directory
     * @param {string} settings.cacheDir Cache directory name
     * @param {Object|string} settings.repo Repo config or "owner/name"
     * @param {Object|null} settings.selectedPack { lang, voice }
     */
    constructor(settings = {}) {
        this.basePath = settings.basePath || path.join(__dirname, "..");

        const userSettings = {};
        ["enabled", "autoUpdateInstalled", "cacheDir", "repo", "selectedPack"].forEach(key => {
            if (settings[key] !== undefined) userSettings[key] = settings[key];
        });

        this.settings = { ...DEFAULT_CONFIG, ...userSettings };
        this._normalizeRepoSettings();
        this._ensureCacheDir();

        this.audioPlayer = new AudioPlayer();

        this._remoteCache = {
            fetchedAt: 0,
            packs: [],
            error: null,
            isFetching: false,
            promise: null
        };

        this._downloadState = new Map();
        this._previewState = new Map();
    }

    _normalizeRepoSettings() {
        let repo = this.settings.repo || DEFAULT_CONFIG.repo;
        if (typeof repo === "string") {
            const [owner, name] = repo.split("/");
            repo = { owner, name, branch: DEFAULT_CONFIG.repo.branch };
        }
        this.settings.repo = { ...DEFAULT_CONFIG.repo, ...repo };
    }

    _ensureCacheDir() {
        const dir = this._getCacheBasePath();
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
    }

    _getCacheBasePath() {
        return path.join(this.basePath, this.settings.cacheDir);
    }

    _getPackPath(lang, voice) {
        return path.join(this._getCacheBasePath(), lang, voice);
    }

    _getPreviewBasePath() {
        return path.join(this._getCacheBasePath(), PREVIEW_DIR_NAME);
    }

    _getPreviewPackPath(lang, voice) {
        return path.join(this._getPreviewBasePath(), lang, voice);
    }


    static normalizeText(text) {
        if (!text) return "";
        return String(text)
            .replace(/[+<>_]/g, " ")
            .replace(/[\u2190-\u21FF]/g, " ")
            .replace(/\s+/g, " ")
            .trim();
    }

    static safeFilename(text, maxLength = 100) {
        let processed = String(text).trim()
            .replace(/[.,!?;:\uFF0C\u3002\uFF01\uFF1F\uFF1B\uFF1A\u201C\u201D\u2018\u2019'"()\uFF08\uFF09\u300C\u300D\u300E\u300F\u3010\u3011\[\]]/g, "")
            .replace(/[\\/:*?"<>|#%=&+]/g, "_")
            .replace(/\s+/g, "_")
            .replace(/_+/g, "_")
            .replace(/^_|_$/g, "");

        if (!processed) processed = "tts_audio";
        return processed.length > maxLength ? processed.substring(0, maxLength) : processed;
    }

    static getTextHash(text) {
        return crypto.createHash("md5").update(text, "utf8").digest("hex").slice(0, 8);
    }

    static buildFileKey(text) {
        const normalized = OnlineTTS.normalizeText(text);
        const hash = OnlineTTS.getTextHash(normalized);
        const safe = OnlineTTS.safeFilename(normalized);
        return {
            normalized,
            hash,
            filename: `${safe}-${hash}`
        };
    }

    _getCacheFilePath(text, lang, voice) {
        const packLang = lang || (this.settings.selectedPack || {}).lang;
        const packVoice = voice || (this.settings.selectedPack || {}).voice;
        if (!packLang || !packVoice) return null;
        const { filename } = OnlineTTS.buildFileKey(text);
        return path.join(this._getPackPath(packLang, packVoice), `${filename}.mp3`);
    }

    playAudio(filePath) {
        return this.audioPlayer.play(filePath, { volume: 100 });
    }

    speak(text, lang = null, voice = null) {
        const filePath = this._getCacheFilePath(text, lang, voice);
        if (!filePath || !fs.existsSync(filePath)) {
            return Promise.reject(new Error("OnlineTTS miss"));
        }
        return this.playAudio(filePath);
    }

    stop() {
        if (this.audioPlayer) this.audioPlayer.stop();
    }

    isEnabled() {
        return !!this.settings.enabled;
    }

    getConfig() {
        return { ...this.settings };
    }

    updateSettings(settings) {
        if (!settings) return this.getConfig();

        if (settings.basePath) {
            this.basePath = settings.basePath;
        }

        const next = { ...this.settings };
        ["enabled", "autoUpdateInstalled", "cacheDir", "repo", "selectedPack"].forEach(key => {
            if (settings[key] !== undefined) next[key] = settings[key];
        });

        this.settings = { ...DEFAULT_CONFIG, ...next };
        this._normalizeRepoSettings();
        this._ensureCacheDir();

        return this.getConfig();
    }

    listInstalledPacks() {
        const base = this._getCacheBasePath();
        if (!fs.existsSync(base)) return [];

        const packs = [];
        const langDirs = fs.readdirSync(base, { withFileTypes: true })
            .filter(dirent => dirent.isDirectory() && dirent.name !== PREVIEW_DIR_NAME)
            .map(dirent => dirent.name);

        for (const lang of langDirs) {
            const langPath = path.join(base, lang);
            const voiceDirs = fs.readdirSync(langPath, { withFileTypes: true })
                .filter(dirent => dirent.isDirectory())
                .map(dirent => dirent.name);

            for (const voice of voiceDirs) {
                packs.push({ lang, voice, langLower: lang.toLowerCase(), voiceLower: voice.toLowerCase() });
            }
        }

        return packs;
    }

    resolveInstalledPack(lang, voice) {
        const keyLang = String(lang || "").toLowerCase();
        const keyVoice = String(voice || "").toLowerCase();
        return this.listInstalledPacks().find(p => p.langLower === keyLang && p.voiceLower === keyVoice) || null;
    }

    getSelectedPack() {
        const selected = this.settings.selectedPack;
        if (selected && selected.lang && selected.voice) {
            return selected;
        }
        const installed = this.listInstalledPacks();
        return installed.length > 0 ? { lang: installed[0].lang, voice: installed[0].voice } : null;
    }

    setSelectedPack(lang, voice) {
        this.settings.selectedPack = { lang, voice };
        return this.settings.selectedPack;
    }

    _readLocalManifest(lang, voice) {
        const filePath = path.join(this._getPackPath(lang, voice), LOCAL_MANIFEST_FILE);
        if (!fs.existsSync(filePath)) return null;
        try {
            return JSON.parse(fs.readFileSync(filePath, "utf8"));
        } catch {
            return null;
        }
    }

    _writeLocalManifest(lang, voice, entry) {
        try {
            const packPath = this._getPackPath(lang, voice);
            fs.mkdirSync(packPath, { recursive: true });
            fs.writeFileSync(path.join(packPath, LOCAL_MANIFEST_FILE), JSON.stringify(entry, null, 2));
        } catch {
            // ignore
        }
    }

    _getLocalFileCount(lang, voice) {
        const packPath = this._getPackPath(lang, voice);
        if (!fs.existsSync(packPath)) return 0;
        try {
            return fs.readdirSync(packPath).filter(name => name.endsWith(".mp3")).length;
        } catch {
            return 0;
        }
    }

    getRemoteCacheStatus() {
        return {
            fetchedAt: this._remoteCache.fetchedAt,
            error: this._remoteCache.error,
            isFetching: this._remoteCache.isFetching
        };
    }

    getCachedRemotePacks() {
        return this._remoteCache.packs || [];
    }

    async refreshRemotePacks(force = false) {
        if (!force && this._remoteCache.fetchedAt &&
            (Date.now() - this._remoteCache.fetchedAt) < REMOTE_CACHE_TTL_MS &&
            this._remoteCache.packs.length > 0) {
            return this._remoteCache.packs;
        }
        if (this._remoteCache.isFetching && this._remoteCache.promise) {
            return this._remoteCache.promise;
        }

        this._remoteCache.isFetching = true;
        this._remoteCache.error = null;

        this._remoteCache.promise = this._fetchRemotePacks()
            .then(packs => {
                this._remoteCache.packs = packs;
                this._remoteCache.fetchedAt = Date.now();
                return packs;
            })
            .catch(err => {
                this._remoteCache.error = err ? err.message : "Unknown error";
                this._remoteCache.packs = [];
                return [];
            })
            .finally(() => {
                this._remoteCache.isFetching = false;
            });

        return this._remoteCache.promise;
    }

    async resolveRemotePack(lang, voice) {
        const packs = await this.refreshRemotePacks();
        const keyLang = String(lang || "").toLowerCase();
        const keyVoice = String(voice || "").toLowerCase();
        return packs.find(p => p.langLower === keyLang && p.voiceLower === keyVoice) || null;
    }

    _buildPackStatus(packs) {
        const installed = this.listInstalledPacks();
        const installedMap = new Map(installed.map(p => [`${p.langLower}|${p.voiceLower}`, p]));

        return packs.map(pack => {
            const key = `${pack.langLower}|${pack.voiceLower}`;
            const local = installedMap.get(key);
            const localManifest = local ? this._readLocalManifest(local.lang, local.voice) : null;
            let updateAvailable = false;
            if (local && (pack.textsHash || pack.updatedAt)) {
                const localHash = localManifest ? localManifest.texts_hash : null;
                const localUpdated = localManifest ? localManifest.updated_at : null;
                const hashMismatch = pack.textsHash && (!localManifest || localHash !== pack.textsHash);
                const updatedMismatch = pack.updatedAt && (!localManifest || !localUpdated || pack.updatedAt > localUpdated);
                updateAvailable = !!(hashMismatch || updatedMismatch);
            }
            const localCount = local ? this._getLocalFileCount(local.lang, local.voice) : 0;

            return {
                ...pack,
                installed: !!local,
                updateAvailable,
                localCount,
                localPack: local || null
            };
        });
    }

    async _fetchRemotePacks() {
        const manifests = await this._fetchManifests();
        const packs = [];

        for (const manifest of manifests) {
            const voiceName = manifest.voice_name || manifest.__voiceName || "unknown";
            const languages = manifest.languages || {};

            for (const [langCode, entry] of Object.entries(languages)) {
                const pack = {
                    voice: voiceName,
                    lang: langCode,
                    voiceLower: voiceName.toLowerCase(),
                    langLower: langCode.toLowerCase(),
                    updatedAt: entry.updated_at || "",
                    textsHash: entry.texts_hash || "",
                    textCount: entry.text_count || 0,
                    generatedCount: entry.generated_count || 0,
                    manifestEntry: entry
                };
                packs.push(pack);
            }
        }

        packs.sort((a, b) => {
            if (a.langLower === b.langLower) {
                return a.voiceLower.localeCompare(b.voiceLower);
            }
            return a.langLower.localeCompare(b.langLower);
        });

        return this._buildPackStatus(packs);
    }

    async _fetchManifests() {
        const { owner, name, branch } = this.settings.repo;
        const rootUrl = `https://api.github.com/repos/${owner}/${name}/contents?ref=${branch}`;
        const items = await this._requestJson(rootUrl);

        if (!Array.isArray(items)) return [];

        const manifestItems = items.filter(item =>
            item.type === "file" &&
            typeof item.name === "string" &&
            item.name.startsWith("tts_manifest_") &&
            item.name.endsWith(".json")
        );

        const manifests = [];
        for (const item of manifestItems) {
            if (!item.download_url) continue;
            try {
                const manifest = await this._requestJson(item.download_url, true);
                if (manifest && typeof manifest === "object") {
                    manifest.__voiceName = manifest.voice_name || item.name.replace(/^tts_manifest_/, "").replace(/\.json$/, "");
                    manifests.push(manifest);
                }
            } catch {
                // ignore invalid manifest
            }
        }

        return manifests;
    }

    async downloadPack(lang, voice, options = {}) {
        const pack = await this.resolveRemotePack(lang, voice);
        if (!pack) {
            throw new Error("Pack not found");
        }

        const key = `${pack.langLower}|${pack.voiceLower}`;
        if (this._downloadState.has(key)) {
            throw new Error("Download already in progress");
        }

        const packPath = this._getPackPath(pack.lang, pack.voice);
        fs.mkdirSync(packPath, { recursive: true });

        this._downloadState.set(key, { status: "downloading" });

        try {
            const { owner, name, branch } = this.settings.repo;
            const pathParts = [encodeURIComponent(pack.lang), encodeURIComponent(pack.voice)];
            const listUrl = `https://api.github.com/repos/${owner}/${name}/contents/${pathParts.join("/")}?ref=${branch}`;
            const files = await this._requestJson(listUrl);

            if (!Array.isArray(files)) {
                throw new Error("Invalid pack listing");
            }

            const audioFiles = files.filter(file =>
                file.type === "file" &&
                typeof file.name === "string" &&
                file.name.endsWith(".mp3") &&
                file.download_url
            );

            const totalFiles = audioFiles.length;
            let completedFiles = 0;
            const reportProgress = (fileName, skipped) => {
                completedFiles += 1;
                if (typeof options.onProgress === "function") {
                    const percent = totalFiles > 0 ? Math.round((completedFiles / totalFiles) * 100) : 100;
                    options.onProgress({
                        total: totalFiles,
                        completed: completedFiles,
                        percent,
                        file: fileName,
                        skipped: !!skipped
                    });
                }
            };

            for (const file of audioFiles) {
                const target = path.join(packPath, file.name);
                if (!options.force && fs.existsSync(target)) {
                    reportProgress(file.name, true);
                    continue;
                }
                await this._downloadFile(file.download_url, target);
                reportProgress(file.name, false);
            }

            if (pack.manifestEntry) {
                this._writeLocalManifest(pack.lang, pack.voice, {
                    voice_name: pack.voice,
                    language_code: pack.lang,
                    texts_hash: pack.textsHash,
                    updated_at: pack.updatedAt,
                    text_count: pack.textCount,
                    generated_count: pack.generatedCount
                });
            }

            this._remoteCache.packs = this._buildPackStatus(this._remoteCache.packs);
            this._downloadState.delete(key);
            return true;
        } catch (err) {
            this._downloadState.delete(key);
            throw err;
        }
    }

    async _findRemoteFileByHash(lang, voice, hash) {
        if (!lang || !voice || !hash) return null;
        const { owner, name, branch } = this.settings.repo;
        const pathParts = [encodeURIComponent(lang), encodeURIComponent(voice)];
        const listUrl = `https://api.github.com/repos/${owner}/${name}/contents/${pathParts.join("/")}?ref=${branch}`;
        try {
            const files = await this._requestJson(listUrl);
            if (!Array.isArray(files)) return null;
            const targetSuffix = `-${String(hash).toLowerCase()}.mp3`;
            const match = files.find(file =>
                file.type === "file" &&
                typeof file.name === "string" &&
                file.name.toLowerCase().endsWith(targetSuffix) &&
                file.download_url
            );
            return match ? match.download_url : null;
        } catch {
            return null;
        }
    }

    async previewPack(lang, voice, text) {
        if (!lang || !voice) {
            throw new Error("Invalid pack");
        }
        if (!text) {
            throw new Error("No preview text");
        }

        const pack = await this.resolveRemotePack(lang, voice);
        if (!pack) {
            throw new Error("Pack not found");
        }

        const key = `preview:${pack.langLower}|${pack.voiceLower}`;
        if (this._previewState.has(key)) {
            throw new Error("Preview already in progress");
        }

        const { owner, name, branch } = this.settings.repo;
        const { filename, hash } = OnlineTTS.buildFileKey(text);
        const encodedLang = encodeURIComponent(pack.lang);
        const encodedVoice = encodeURIComponent(pack.voice);
        const encodedFile = encodeURIComponent(`${filename}.mp3`);
        const rawUrl = `https://raw.githubusercontent.com/${owner}/${name}/${branch}/${encodedLang}/${encodedVoice}/${encodedFile}`;

        const previewPath = this._getPreviewPackPath(pack.lang, pack.voice);
        fs.mkdirSync(previewPath, { recursive: true });
        const targetPath = path.join(previewPath, `${filename}.mp3`);

        this._previewState.set(key, { status: "downloading" });
        try {
            if (!fs.existsSync(targetPath)) {
                const fallbackUrl = await this._findRemoteFileByHash(pack.lang, pack.voice, hash);
                await this._downloadFile(fallbackUrl || rawUrl, targetPath);
            }
            await this.playAudio(targetPath);
            this._previewState.delete(key);
            return true;
        } catch (err) {
            this._previewState.delete(key);
            throw err;
        }
    }

    deletePack(lang, voice) {
        const pack = this.resolveInstalledPack(lang, voice);
        const packLang = pack ? pack.lang : lang;
        const packVoice = pack ? pack.voice : voice;
        const packPath = this._getPackPath(packLang, packVoice);
        const previewPath = this._getPreviewPackPath(packLang, packVoice);

        if (!fs.existsSync(packPath)) return false;

        if (fs.rmSync) {
            fs.rmSync(packPath, { recursive: true, force: true });
        } else {
            fs.rmdirSync(packPath, { recursive: true });
        }

        if (fs.existsSync(previewPath)) {
            if (fs.rmSync) {
                fs.rmSync(previewPath, { recursive: true, force: true });
            } else {
                fs.rmdirSync(previewPath, { recursive: true });
            }
        }

        if (this.settings.selectedPack &&
            this.settings.selectedPack.lang === packLang &&
            this.settings.selectedPack.voice === packVoice) {
            this.settings.selectedPack = null;
        }

        this._remoteCache.packs = this._buildPackStatus(this._remoteCache.packs);
        return true;
    }

    _requestJson(url, isRaw = false) {
        return new Promise((resolve, reject) => {
            const headers = {
                "User-Agent": "tera-guide-tts-cache"
            };
            if (!isRaw) {
                headers["Accept"] = "application/vnd.github+json";
            }

            https.get(url, { headers }, res => {
                let data = "";
                res.on("data", chunk => { data += chunk; });
                res.on("end", () => {
                    if (res.statusCode < 200 || res.statusCode >= 300) {
                        return reject(new Error(`HTTP ${res.statusCode}`));
                    }
                    try {
                        resolve(JSON.parse(data));
                    } catch (err) {
                        reject(err);
                    }
                });
            }).on("error", reject);
        });
    }

    _downloadFile(url, targetPath) {
        return new Promise((resolve, reject) => {
            const tmpPath = `${targetPath}.tmp`;
            const file = fs.createWriteStream(tmpPath);

            const safeUrl = encodeURI(url);
            https.get(safeUrl, { headers: { "User-Agent": "tera-guide-tts-cache" } }, res => {
                if (res.statusCode < 200 || res.statusCode >= 300) {
                    file.close();
                    try { fs.unlinkSync(tmpPath); } catch { /* ignore */ }
                    return reject(new Error(`HTTP ${res.statusCode}`));
                }

                res.pipe(file);
                file.on("finish", () => {
                    file.close(() => {
                        fs.rename(tmpPath, targetPath, err => {
                            if (err) return reject(err);
                            resolve();
                        });
                    });
                });
            }).on("error", err => {
                file.close();
                try { fs.unlinkSync(tmpPath); } catch { /* ignore */ }
                reject(err);
            });
        });
    }
}

module.exports = OnlineTTS;
