"use strict";

const fs = require("fs");
const path = require("path");
const https = require("https");

const REQUEST_TIMEOUT_MS = 60 * 1000;
const CONTENTS_LIST_LIMIT = 1000;
const PACK_DOWNLOAD_CONCURRENCY = 2;
const RETRYABLE_ERROR_CODES = new Set(["EPROTO", "ECONNRESET", "ETIMEDOUT", "EPIPE", "EAI_AGAIN", "ENOTFOUND"]);
const RETRYABLE_STATUS_CODES = new Set([429, 500, 502, 503, 504]);

class TTSDownload {
    constructor(options = {}) {
        this._repo = options.repo || {};
        this._debugEnabled = !!options.debug;
        this._logger = typeof options.logger === "function" ? options.logger : null;
        this._requestTimeoutMs = Number.isInteger(options.requestTimeoutMs) ? options.requestTimeoutMs : REQUEST_TIMEOUT_MS;
        this._downloadState = new Map();
        this._previewState = new Map();
        this._activeRequests = new Set();
        this._cancelAll = false;
    }

    updateSettings(options = {}) {
        if (options.repo) this._repo = options.repo;
        if (options.debug !== undefined) this._debugEnabled = !!options.debug;
        if (options.logger !== undefined) {
            this._logger = typeof options.logger === "function" ? options.logger : null;
        }
        if (Number.isInteger(options.requestTimeoutMs)) {
            this._requestTimeoutMs = options.requestTimeoutMs;
        }
    }

    cancelAll() {
        this._cancelAll = true;
        for (const req of this._activeRequests) {
            try {
                req.destroy(Object.assign(new Error("Cancelled"), { code: "ECANCELED" }));
            } catch {
                // ignore cancel errors
            }
        }
        this._activeRequests.clear();
    }

    _debugLog(message) {
        if (!this._debugEnabled || !this._logger) return;
        try {
            this._logger(message);
        } catch {
            // ignore logging errors
        }
    }

    requestJson(url, isRaw = false) {
        return new Promise((resolve, reject) => {
            const headers = {
                "User-Agent": "tera-guide-tts-cache"
            };
            if (!isRaw) {
                headers["Accept"] = "application/vnd.github+json";
            }

            let finished = false;
            let timer = null;
            const done = (err, data) => {
                if (finished) return;
                finished = true;
                clearTimeout(timer);
                if (err) reject(err);
                else resolve(data);
            };

            const req = https.get(url, { headers }, res => {
                const chunks = [];
                res.on("data", chunk => { chunks.push(chunk); });
                res.on("end", () => {
                    if (res.statusCode < 200 || res.statusCode >= 300) {
                        return done(new Error(`HTTP ${res.statusCode}`));
                    }
                    try {
                        const data = Buffer.concat(chunks).toString("utf8");
                        done(null, JSON.parse(data));
                    } catch (err) {
                        done(err);
                    }
                });
            });

            timer = setTimeout(() => {
                req.destroy(Object.assign(new Error(`Timeout ${this._requestTimeoutMs}ms`), { code: "ETIMEDOUT" }));
            }, this._requestTimeoutMs);

            req.on("error", err => done(err));
        });
    }

    async listPackFiles(pack) {
        let fallbackFiles = null;

        try {
            const contents = await this._listPackFilesViaContents(pack);
            if (contents) {
                fallbackFiles = contents.files;
                if (contents.isComplete) return contents.files;
            }
        } catch (err) {
            this._debugLog(`[OnlineTTS][Debug] List failed ${pack.lang}/${pack.voice} err=${err ? err.message : err}`);
        }

        try {
            const treeFiles = await this._listPackFilesViaTree(pack);
            return treeFiles.length > 0 ? treeFiles : (fallbackFiles || []);
        } catch (err) {
            this._debugLog(`[OnlineTTS][Debug] Tree list failed ${pack.lang}/${pack.voice} err=${err ? err.message : err}`);
            return fallbackFiles || [];
        }
    }

    async _listPackFilesViaContents(pack) {
        const { owner, name, branch } = this._repo;
        const pathParts = [encodeURIComponent(pack.lang), encodeURIComponent(pack.voice)];
        const listUrl = `https://api.github.com/repos/${owner}/${name}/contents/${pathParts.join("/")}?ref=${branch}`;
        this._debugLog(`[OnlineTTS][Debug] List URL: ${listUrl}`);

        const items = await this.requestJson(listUrl);
        if (!Array.isArray(items)) return null;

        const files = items.filter(file =>
            file.type === "file" &&
            typeof file.name === "string" &&
            file.name.endsWith(".wav") &&
            file.download_url
        ).map(file => ({
            name: file.name,
            download_url: file.download_url
        }));

        return { files, isComplete: items.length < CONTENTS_LIST_LIMIT };
    }

    async _listPackFilesViaTree(pack) {
        const { owner, name, branch } = this._repo;
        const treeUrl = await this._getPackTreeUrl(pack);
        if (!treeUrl) return [];

        const url = `${treeUrl}?recursive=1`;
        this._debugLog(`[OnlineTTS][Debug] Tree URL: ${url}`);

        const treeData = await this.requestJson(url);
        if (!treeData || !Array.isArray(treeData.tree)) return [];
        if (treeData.truncated) {
            throw new Error("Tree listing truncated");
        }

        const entries = treeData.tree.filter(entry =>
            entry &&
            entry.type === "blob" &&
            typeof entry.path === "string" &&
            entry.path.toLowerCase().endsWith(".wav")
        );

        return entries.map(entry => {
            const relativePath = entry.path;
            const fullPath = `${pack.lang}/${pack.voice}/${relativePath}`;
            const encodedPath = this._encodePathSegments(fullPath);
            const rawUrl = `https://raw.githubusercontent.com/${owner}/${name}/${branch}/${encodedPath}`;
            return { name: relativePath, download_url: rawUrl };
        });
    }

    async _getPackTreeUrl(pack) {
        const { owner, name, branch } = this._repo;
        const encodedLang = encodeURIComponent(pack.lang);
        const parentUrl = `https://api.github.com/repos/${owner}/${name}/contents/${encodedLang}?ref=${branch}`;
        this._debugLog(`[OnlineTTS][Debug] Pack parent URL: ${parentUrl}`);

        const entries = await this.requestJson(parentUrl);
        if (!Array.isArray(entries)) return null;

        const match = entries.find(entry =>
            entry &&
            entry.type === "dir" &&
            entry.name === pack.voice &&
            entry.git_url
        );

        return match ? match.git_url : null;
    }

    async findRemoteFileByHash(lang, voice, hash) {
        if (!lang || !voice || !hash) return null;
        try {
            const files = await this.listPackFiles({ lang, voice });
            if (!Array.isArray(files)) return null;
            const targetSuffix = `-${String(hash).toLowerCase()}.wav`;
            const match = files.find(file =>
                typeof file.name === "string" &&
                file.name.toLowerCase().endsWith(targetSuffix) &&
                file.download_url
            );
            return match ? match.download_url : null;
        } catch {
            return null;
        }
    }

    _encodePathSegments(inputPath) {
        return String(inputPath || "")
            .split("/")
            .map(segment => encodeURIComponent(segment))
            .join("/");
    }

    _getPackKey(pack) {
        const lang = String(pack.lang || "").toLowerCase();
        const voice = String(pack.voice || "").toLowerCase();
        return `${lang}|${voice}`;
    }

    _getPreviewKey(pack) {
        return `preview:${this._getPackKey(pack)}`;
    }

    _getOrCreateDownloadState(pack, onProgress) {
        const key = this._getPackKey(pack);
        const existingState = this._downloadState.get(key);
        if (existingState && existingState.promise) {
            this._debugLog(`[OnlineTTS][Debug] Join existing download: ${pack.lang}/${pack.voice}`);
            if (typeof onProgress === "function") {
                existingState.listeners.add(onProgress);
            }
            return { state: existingState, joined: true };
        }

        const state = { status: "downloading", listeners: new Set(), promise: null };
        if (typeof onProgress === "function") {
            state.listeners.add(onProgress);
        }
        this._downloadState.set(key, state);
        return { state, joined: false };
    }

    _clearDownloadState(pack, state) {
        const key = this._getPackKey(pack);
        const current = this._downloadState.get(key);
        if (current === state) {
            this._downloadState.delete(key);
        }
    }

    async _withPreviewState(pack, handler) {
        const key = this._getPreviewKey(pack);
        if (this._previewState.has(key)) {
            throw new Error("Preview already in progress");
        }
        this._previewState.set(key, { status: "downloading" });
        try {
            return await handler();
        } finally {
            this._previewState.delete(key);
        }
    }

    downloadPack(pack, packPath, options = {}) {
        if (!pack || !pack.lang || !pack.voice) {
            return Promise.reject(new Error("Invalid pack"));
        }
        if (!packPath) {
            return Promise.reject(new Error("Invalid pack path"));
        }
        this._cancelAll = false;

        const { state, joined } = this._getOrCreateDownloadState(pack, options.onProgress);
        if (joined) return state.promise;

        this._debugLog(`[OnlineTTS][Debug] Start download: ${pack.lang}/${pack.voice} force=${!!options.force}`);

        state.promise = this._runPackDownload(pack, packPath, options, state)
            .finally(() => this._clearDownloadState(pack, state));
        return state.promise;
    }

    async previewPack(pack, text, options = {}) {
        if (!pack || !pack.lang || !pack.voice) {
            throw new Error("Invalid pack");
        }
        if (!text) {
            throw new Error("No preview text");
        }
        if (typeof options.buildFileKey !== "function") {
            throw new Error("Invalid preview builder");
        }
        if (!options.previewPath) {
            throw new Error("Invalid preview path");
        }
        if (typeof options.playAudio !== "function") {
            throw new Error("Invalid audio player");
        }

        return this._withPreviewState(pack, async () => {
            const { filename, hash } = options.buildFileKey(text);
            const previewPath = options.previewPath;
            const targetPath = path.join(previewPath, `${filename}.wav`);
            const rawUrl = this._buildRawUrl(pack, filename);

            fs.mkdirSync(previewPath, { recursive: true });
            if (!fs.existsSync(targetPath)) {
                const fallbackUrl = await this.findRemoteFileByHash(pack.lang, pack.voice, hash);
                await this.downloadFile(fallbackUrl || rawUrl, targetPath);
            }

            await options.playAudio(targetPath);
            return true;
        });
    }

    _collectPendingFiles(packPath, audioFiles, force) {
        let completedFiles = 0;
        let pendingFiles = audioFiles;

        if (!force && audioFiles.length > 0) {
            pendingFiles = [];
            for (const file of audioFiles) {
                const target = path.join(packPath, file.name);
                if (fs.existsSync(target)) {
                    completedFiles += 1;
                } else {
                    pendingFiles.push(file);
                }
            }
        }

        return { completedFiles, pendingFiles };
    }

    _createProgressEmitter(state, totalFiles, getCompleted) {
        return (fileName, skipped, initial) => {
            if (!state || state.listeners.size === 0) return;
            const completed = getCompleted();
            const percent = totalFiles > 0 ? Math.round((completed / totalFiles) * 100) : 100;
            const payload = {
                total: totalFiles,
                completed,
                percent,
                file: fileName,
                skipped: !!skipped,
                initial: !!initial
            };
            state.listeners.forEach(listener => {
                try { listener(payload); } catch { /* ignore listener errors */ }
            });
        };
    }

    async _downloadPendingFiles(pack, packPath, pendingFiles, concurrency, onFileComplete) {
        const errors = [];
        let index = 0;
        const workerCount = Math.min(concurrency, pendingFiles.length);

        const worker = async () => {
            while (true) {
                if (this._cancelAll) return;
                const current = index;
                index += 1;
                if (current >= pendingFiles.length) return;
                const file = pendingFiles[current];
                const target = path.join(packPath, file.name);
                try { fs.mkdirSync(path.dirname(target), { recursive: true }); } catch { /* ignore */ }
                try {
                    await this.downloadFile(file.download_url, target);
                    onFileComplete(file.name, false);
                } catch (err) {
                    this._debugLog(`[OnlineTTS][Debug] Download failed ${pack.lang}/${pack.voice} file=${file.name} url=${file.download_url} err=${err ? err.message : err}`);
                    errors.push({ name: file.name, error: err });
                    onFileComplete(file.name, true);
                }
            }
        };

        const workers = [];
        for (let i = 0; i < workerCount; i += 1) {
            workers.push(worker());
        }
        await Promise.all(workers);
        return errors;
    }

    async _runPackDownload(pack, packPath, options, state) {
        fs.mkdirSync(packPath, { recursive: true });

        const audioFiles = await this.listPackFiles(pack);
        if (!Array.isArray(audioFiles)) {
            this._debugLog(`[OnlineTTS][Debug] Invalid pack listing for ${pack.lang}/${pack.voice}`);
            throw new Error("Invalid pack listing");
        }

        const totalFiles = audioFiles.length;
        const localCount = this._getLocalFileCount(packPath);
        const concurrency = Number.isInteger(options.concurrency) ? options.concurrency : PACK_DOWNLOAD_CONCURRENCY;
        const { completedFiles: initialCompleted, pendingFiles } = this._collectPendingFiles(packPath, audioFiles, options.force);
        let completedFiles = initialCompleted;

        this._debugLog(`[OnlineTTS][Debug] ${pack.lang}/${pack.voice} total=${totalFiles} local=${localCount} completed=${completedFiles} pending=${pendingFiles.length} force=${!!options.force} concurrency=${concurrency}`);

        const emitProgress = this._createProgressEmitter(state, totalFiles, () => completedFiles);
        if (completedFiles > 0 || totalFiles === 0) {
            emitProgress(null, completedFiles > 0, true);
        }

        if (pendingFiles.length > 0) {
            const errors = await this._downloadPendingFiles(pack, packPath, pendingFiles, concurrency, (fileName, skipped) => {
                completedFiles += 1;
                emitProgress(fileName, skipped, false);
            });
            if (this._cancelAll) {
                const err = new Error("Download cancelled");
                err.code = "ECANCELED";
                throw err;
            }
            if (errors.length > 0) {
                this._debugLog(`[OnlineTTS][Debug] Download completed with ${errors.length} failed file(s) for ${pack.lang}/${pack.voice}`);
            }
        }

        this._cleanupInvalidFiles(packPath, audioFiles);
        return true;
    }

    _getLocalFileCount(packPath) {
        if (!fs.existsSync(packPath)) return 0;
        try {
            return fs.readdirSync(packPath).filter(name => name.endsWith(".wav")).length;
        } catch {
            return 0;
        }
    }

    _buildRawUrl(pack, filename) {
        const { owner, name, branch } = this._repo;
        const encodedLang = encodeURIComponent(pack.lang);
        const encodedVoice = encodeURIComponent(pack.voice);
        const encodedFile = encodeURIComponent(`${filename}.wav`);
        return `https://raw.githubusercontent.com/${owner}/${name}/${branch}/${encodedLang}/${encodedVoice}/${encodedFile}`;
    }

    _isLikelyValidWav(filePath) {
        try {
            const stat = fs.statSync(filePath);
            if (!stat || stat.size < 1024) return false;

            const fd = fs.openSync(filePath, "r");
            try {
                const buf = Buffer.alloc(12);
                const read = fs.readSync(fd, buf, 0, 12, 0);
                if (read >= 12 &&
                    buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
                    buf[8] === 0x57 && buf[9] === 0x41 && buf[10] === 0x56 && buf[11] === 0x45) {
                    return true; // "RIFF" ... "WAVE"
                }
                return false;
            } finally {
                try { fs.closeSync(fd); } catch { /* ignore */ }
            }
        } catch (err) {
            this._debugLog(`[OnlineTTS][Debug] Validate wav failed ${filePath} err=${err ? err.message : err}`);
            return true;
        }
    }

    _cleanupInvalidFiles(packPath, audioFiles) {
        if (!Array.isArray(audioFiles) || audioFiles.length === 0) return;
        let removed = 0;
        for (const file of audioFiles) {
            const target = path.join(packPath, file.name);
            if (!fs.existsSync(target)) continue;
            const ok = this._isLikelyValidWav(target);
            if (ok) continue;
            try {
                fs.unlinkSync(target);
                removed += 1;
                this._debugLog(`[OnlineTTS][Debug] Removed invalid wav ${target}`);
            } catch (err) {
                this._debugLog(`[OnlineTTS][Debug] Failed to remove invalid wav ${target} err=${err ? err.message : err}`);
            }
        }
        if (removed > 0) {
            this._debugLog(`[OnlineTTS][Debug] Cleanup removed ${removed} invalid file(s)`);
        }
    }

    downloadFile(url, targetPath, options = {}) {
        const maxRetries = Number.isInteger(options.retries) ? options.retries : 3;
        const baseDelayMs = Number.isInteger(options.retryDelayMs) ? options.retryDelayMs : 500;
        const timeoutMs = Number.isInteger(options.timeoutMs) ? options.timeoutMs : 30000;

        const isRetryableError = (err) => {
            if (!err) return false;
            const code = err.code;
            if (code && RETRYABLE_ERROR_CODES.has(code)) return true;
            const status = err.statusCode;
            if (status) return true;
            return false;
        };

        const attemptDownload = (attempt) => new Promise((resolve, reject) => {
            if (this._cancelAll) {
                const err = new Error("Download cancelled");
                err.code = "ECANCELED";
                return reject(err);
            }
            let finished = false;

            const finalize = (err, data) => {
                if (finished) return;
                finished = true;
                if (err) {
                    if (fs.existsSync(targetPath)) {
                        try {
                            const stat = fs.statSync(targetPath);
                            if (stat.size > 1024) {
                                this._debugLog(`[OnlineTTS][Debug] Target exists, skip error for ${targetPath}`);
                                return resolve();
                            }
                        } catch {
                            // fall through to error handling
                        }
                    }
                    reject(err);
                } else {
                    try {
                        fs.mkdirSync(path.dirname(targetPath), { recursive: true });
                    } catch { /* ignore */ }
                    fs.writeFile(targetPath, data, writeErr => {
                        if (writeErr) {
                            if (fs.existsSync(targetPath)) {
                                try {
                                    const stat = fs.statSync(targetPath);
                                    if (stat.size > 1024) {
                                        this._debugLog(`[OnlineTTS][Debug] Target exists, skip write for ${targetPath}`);
                                        return resolve();
                                    }
                                } catch {
                                    // fall through to error handling
                                }
                            }
                            try { if (fs.existsSync(targetPath)) fs.unlinkSync(targetPath); } catch { /* ignore */ }
                            return reject(writeErr);
                        }
                        resolve();
                    });
                }
            };

            const req = https.get(url, { headers: { "User-Agent": "tera-guide-tts-cache" } }, res => {
                if (res.statusCode < 200 || res.statusCode >= 300) {
                    this._debugLog(`[OnlineTTS][Debug] HTTP ${res.statusCode} for ${url}`);
                    const err = new Error(`HTTP ${res.statusCode}`);
                    err.statusCode = res.statusCode;
                    return finalize(err);
                }

                const chunks = [];
                let totalLength = 0;

                res.on("data", chunk => {
                    chunks.push(chunk);
                    totalLength += chunk.length;
                });
                res.on("error", err => finalize(err));
                res.on("aborted", () => {
                    const err = new Error("Response aborted");
                    err.code = "ECONNRESET";
                    finalize(err);
                });
                res.on("end", () => {
                    if (finished) return;
                    const data = Buffer.concat(chunks, totalLength);
                    finalize(null, data);
                });
            });

            req.setTimeout(timeoutMs, () => {
                req.destroy(Object.assign(new Error(`Timeout ${timeoutMs}ms`), { code: "ETIMEDOUT" }));
            });

            this._activeRequests.add(req);
            const done = (err) => {
                this._activeRequests.delete(req);
                finalize(err);
            };
            req.on("error", err => done(err));
            req.on("close", () => {
                this._activeRequests.delete(req);
            });
        }).catch(err => {
            if (attempt < maxRetries && isRetryableError(err)) {
                const delay = baseDelayMs * Math.pow(2, attempt);
                this._debugLog(`[OnlineTTS][Debug] Retry ${attempt + 1}/${maxRetries} after ${delay}ms for ${url} err=${err ? err.message : err}`);
                return new Promise(resolve => setTimeout(resolve, delay))
                    .then(() => attemptDownload(attempt + 1));
            }
            throw err;
        });

        return attemptDownload(0);
    }
}

module.exports = TTSDownload;
