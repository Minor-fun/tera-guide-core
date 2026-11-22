"use strict";

const fs = require("fs");
const path = require("path");
const https = require("https");

const REQUEST_TIMEOUT_MS = 60 * 1000;
const PACK_DOWNLOAD_CONCURRENCY = 2;
const PACK_CHECK_CONCURRENCY = 4;
const RETRYABLE_ERROR_CODES = new Set(["EPROTO", "ECONNRESET", "ETIMEDOUT", "EPIPE", "EAI_AGAIN", "ENOTFOUND"]);
const RETRYABLE_STATUS_CODES = new Set([408, 429, 500, 502, 503, 504]);
const REDIRECT_STATUS_CODES = new Set([301, 302, 303, 307, 308]);
const MAX_REDIRECTS = 5;

class TTSDownload {
    constructor(options = {}) {
        this._dataset = options.dataset || {};
        this._debugEnabled = !!options.debug;
        this._logger = typeof options.logger === "function" ? options.logger : null;
        this._requestTimeoutMs = Number.isInteger(options.requestTimeoutMs) ? options.requestTimeoutMs : REQUEST_TIMEOUT_MS;
        this._downloadState = new Map();
        this._previewState = new Set();
        this._activeRequests = new Set();
        this._retryTimers = new Map();
        this._cancelAll = false;
    }

    updateSettings(options = {}) {
        if (options.dataset) this._dataset = options.dataset;
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
                req.destroy(this._cancelError());
            } catch {
                // ignore cancel errors
            }
        }
        this._activeRequests.clear();
        for (const [timer, reject] of this._retryTimers) {
            clearTimeout(timer);
            reject(this._cancelError());
        }
        this._retryTimers.clear();
    }

    _cancelError() {
        return Object.assign(new Error("Download cancelled"), { code: "ECANCELED" });
    }

    _throwIfCancelled() {
        if (this._cancelAll) throw this._cancelError();
    }

    _waitRetry(delayMs) {
        return new Promise((resolve, reject) => {
            if (this._cancelAll) return reject(this._cancelError());
            const timer = setTimeout(() => {
                this._retryTimers.delete(timer);
                resolve();
            }, delayMs);
            this._retryTimers.set(timer, reject);
        });
    }

    _debugLog(message) {
        if (!this._debugEnabled || !this._logger) return;
        try {
            this._logger(message);
        } catch {
            // ignore logging errors
        }
    }

    _encodePathSegments(inputPath) {
        return String(inputPath || "")
            .split("/")
            .map(segment => encodeURIComponent(segment))
            .join("/");
    }

    _resolveRedirectUrl(currentUrl, location) {
        try {
            return new URL(location, currentUrl).toString();
        } catch {
            return location;
        }
    }

    buildFileUrl(relativePath) {
        const repoId = this._dataset.repoId;
        const revision = this._dataset.revision || "main";
        if (!repoId || !relativePath) return "";
        return `https://huggingface.co/datasets/${this._encodePathSegments(repoId)}/resolve/${encodeURIComponent(revision)}/${this._encodePathSegments(relativePath)}`;
    }

    async requestJson(url) {
        this._throwIfCancelled();
        const data = await this._requestBuffer(url, this._requestTimeoutMs, {
            "User-Agent": "tera-guide-tts-cache",
            "Accept": "application/json"
        }, true);
        this._throwIfCancelled();
        return JSON.parse(data.toString("utf8"));
    }

    _requestBuffer(url, timeoutMs, headers, totalTimeout = false) {
        return new Promise((resolve, reject) => {
            if (this._cancelAll) return reject(this._cancelError());

            let finished = false;
            let timer = null;
            const requests = new Set();
            const done = (err, data) => {
                if (finished) return;
                finished = true;
                clearTimeout(timer);
                if (this._cancelAll) err = this._cancelError();
                for (const req of requests) {
                    this._activeRequests.delete(req);
                    if (err) req.destroy();
                }
                requests.clear();
                if (err) reject(err);
                else resolve(data);
            };
            const timeout = () => done(Object.assign(new Error(`Timeout ${timeoutMs}ms`), { code: "ETIMEDOUT" }));
            const aborted = () => done(Object.assign(new Error("Response aborted"), { code: "ECONNRESET" }));

            const requestUrl = (currentUrl, redirects = 0) => {
                if (finished) return;
                if (this._cancelAll) return done(this._cancelError());
                let redirected = false;
                let ended = false;
                let receivedResponse = false;
                try {
                    const req = https.get(currentUrl, { headers }, res => {
                        receivedResponse = true;
                        res.on("error", err => { if (!redirected) done(err); });
                        res.on("aborted", () => { if (!redirected) aborted(); });
                        res.on("close", () => { if (!redirected && !ended) aborted(); });
                        if (finished || this._cancelAll) {
                            res.destroy();
                            return done(this._cancelError());
                        }

                        if (REDIRECT_STATUS_CODES.has(res.statusCode) && res.headers.location) {
                            redirected = true;
                            res.destroy();
                            requests.delete(req);
                            this._activeRequests.delete(req);
                            req.destroy();
                            if (redirects >= MAX_REDIRECTS) {
                                return done(new Error("Too many redirects"));
                            }
                            return requestUrl(this._resolveRedirectUrl(currentUrl, res.headers.location), redirects + 1);
                        }

                        if (res.statusCode < 200 || res.statusCode >= 300) {
                            this._debugLog(`[OnlineTTS][Debug] HTTP ${res.statusCode} for ${currentUrl}`);
                            const err = new Error(`HTTP ${res.statusCode}`);
                            err.statusCode = res.statusCode;
                            done(err);
                            res.destroy();
                            return;
                        }

                        const chunks = [];
                        let totalLength = 0;
                        res.on("data", chunk => {
                            if (finished) return;
                            if (this._cancelAll) return done(this._cancelError());
                            chunks.push(chunk);
                            totalLength += chunk.length;
                        });
                        res.on("end", () => {
                            ended = true;
                            if (finished) return;
                            try {
                                done(null, Buffer.concat(chunks, totalLength));
                            } catch (err) {
                                done(err);
                            }
                        });
                    });

                    requests.add(req);
                    this._activeRequests.add(req);
                    req.on("error", err => { if (!redirected) done(err); });
                    req.on("close", () => {
                        requests.delete(req);
                        this._activeRequests.delete(req);
                        if (!finished && !redirected && !receivedResponse) aborted();
                    });
                    if (!totalTimeout) req.setTimeout(timeoutMs, timeout);
                } catch (err) {
                    done(err);
                }
            };

            if (totalTimeout) timer = setTimeout(timeout, timeoutMs);
            requestUrl(url);
        });
    }

    listPackFiles(pack) {
        if (!pack || !Array.isArray(pack.remoteFiles)) {
            return Promise.resolve([]);
        }

        const files = pack.remoteFiles.map(file => {
            if (typeof file === "string") {
                const relativePath = `${pack.lang}/${pack.voice}/${file}`;
                return {
                    name: file,
                    download_url: this.buildFileUrl(relativePath)
                };
            }

            const name = file.name || path.basename(file.path || "");
            const relativePath = file.path || `${pack.lang}/${pack.voice}/${name}`;
            return {
                name,
                download_url: file.download_url || this.buildFileUrl(relativePath)
            };
        }).filter(file => file.name && file.download_url);

        return Promise.resolve(files);
    }

    async findRemoteFileByHash(pack, hash) {
        if (!pack || !pack.lang || !pack.voice || !hash) return null;
        try {
            const files = await this.listPackFiles(pack);
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

    _getPackKey(pack) {
        const lang = String(pack.lang || "").toLowerCase();
        const voice = String(pack.voice || "").toLowerCase();
        return `${lang}|${voice}`;
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

        const state = { listeners: new Set(), promise: null };
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
        this._throwIfCancelled();
        const key = this._getPackKey(pack);
        if (this._previewState.has(key)) {
            throw new Error("Preview already in progress");
        }
        this._previewState.add(key);
        try {
            return await handler();
        } finally {
            this._previewState.delete(key);
        }
    }

    downloadPack(pack, packPath, options = {}) {
        if (this._cancelAll) return Promise.reject(this._cancelError());
        if (!pack || !pack.lang || !pack.voice) {
            return Promise.reject(new Error("Invalid pack"));
        }
        if (!packPath) {
            return Promise.reject(new Error("Invalid pack path"));
        }
        const { state, joined } = this._getOrCreateDownloadState(pack, options.onProgress);
        if (joined) return state.promise;

        this._debugLog(`[OnlineTTS][Debug] Start download: ${pack.lang}/${pack.voice} force=${!!options.force}`);

        state.promise = this._runPackDownload(pack, packPath, options, state)
            .finally(() => this._clearDownloadState(pack, state));
        return state.promise;
    }

    async previewPack(pack, text, options = {}) {
        this._throwIfCancelled();
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

            await fs.promises.mkdir(previewPath, { recursive: true });
            this._throwIfCancelled();
            if (!await this._fileExists(targetPath)) {
                const fallbackUrl = await this.findRemoteFileByHash(pack, hash);
                this._throwIfCancelled();
                await this.downloadFile(fallbackUrl || rawUrl, targetPath);
            }

            this._throwIfCancelled();
            await options.playAudio(targetPath);
            this._throwIfCancelled();
            return true;
        });
    }

    async _fileExists(filePath) {
        this._throwIfCancelled();
        try {
            await fs.promises.access(filePath);
            this._throwIfCancelled();
            return true;
        } catch {
            this._throwIfCancelled();
            return false;
        }
    }

    async _forEachFile(files, handler) {
        let index = 0;
        const worker = async () => {
            while (index < files.length) {
                this._throwIfCancelled();
                const current = index++;
                await handler(files[current], current);
            }
        };
        const workers = [];
        for (let i = 0; i < Math.min(PACK_CHECK_CONCURRENCY, files.length); i += 1) {
            workers.push(worker());
        }
        await Promise.all(workers);
        this._throwIfCancelled();
    }

    async _collectPendingFiles(packPath, audioFiles, force) {
        this._throwIfCancelled();
        let completedFiles = 0;
        let pendingFiles = audioFiles;

        if (!force && audioFiles.length > 0) {
            const missing = [];
            await this._forEachFile(audioFiles, async (file, index) => {
                const target = path.join(packPath, file.name);
                if (await this._fileExists(target)) {
                    completedFiles += 1;
                } else {
                    missing[index] = true;
                }
            });
            pendingFiles = audioFiles.filter((file, index) => missing[index]);
        }

        return { completedFiles, pendingFiles };
    }

    _createProgressEmitter(state, totalFiles, getCompleted) {
        return (fileName, skipped, initial) => {
            if (!state || state.listeners.size === 0) return;
            const completed = getCompleted();
            const percent = totalFiles > 0 ? Math.floor((completed / totalFiles) * 100) : 100;
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
                this._throwIfCancelled();
                const current = index;
                index += 1;
                if (current >= pendingFiles.length) return;
                const file = pendingFiles[current];
                const target = path.join(packPath, file.name);
                try {
                    this._throwIfCancelled();
                    await this.downloadFile(file.download_url, target);
                    this._throwIfCancelled();
                    onFileComplete(file.name);
                } catch (err) {
                    this._throwIfCancelled();
                    this._debugLog(`[OnlineTTS][Debug] Download failed ${pack.lang}/${pack.voice} file=${file.name} url=${file.download_url} err=${err ? err.message : err}`);
                    errors.push(err);
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
        this._throwIfCancelled();
        await fs.promises.mkdir(packPath, { recursive: true });
        this._throwIfCancelled();

        const audioFiles = await this.listPackFiles(pack);

        const totalFiles = audioFiles.length;
        const concurrency = Number.isInteger(options.concurrency) && options.concurrency > 0 ? options.concurrency : PACK_DOWNLOAD_CONCURRENCY;
        const { completedFiles: initialCompleted, pendingFiles } = await this._collectPendingFiles(packPath, audioFiles, options.force);
        let completedFiles = initialCompleted;

        this._debugLog(`[OnlineTTS][Debug] ${pack.lang}/${pack.voice} total=${totalFiles} completed=${completedFiles} pending=${pendingFiles.length} force=${!!options.force} concurrency=${concurrency}`);

        const emitProgress = this._createProgressEmitter(state, totalFiles, () => completedFiles);
        emitProgress(null, completedFiles > 0, true);

        let errors = [];
        if (pendingFiles.length > 0) {
            errors = await this._downloadPendingFiles(pack, packPath, pendingFiles, concurrency, fileName => {
                completedFiles += 1;
                emitProgress(fileName, false, false);
            });
            this._throwIfCancelled();
        }

        await this._cleanupInvalidFiles(packPath, audioFiles);
        this._throwIfCancelled();
        if (errors.length > 0) {
            const err = new Error(`Incomplete download (${completedFiles}/${totalFiles}): ${errors[0].message}`);
            err.code = "EINCOMPLETE";
            throw err;
        }
        return true;
    }

    _buildRawUrl(pack, filename) {
        return this.buildFileUrl(`${pack.lang}/${pack.voice}/${filename}.wav`);
    }

    async _isLikelyValidWav(filePath) {
        this._throwIfCancelled();
        try {
            const stat = await fs.promises.stat(filePath);
            this._throwIfCancelled();
            if (!stat || stat.size < 1024) return false;

            const fd = await fs.promises.open(filePath, "r");
            try {
                this._throwIfCancelled();
                const buf = Buffer.alloc(12);
                const { bytesRead } = await fd.read(buf, 0, 12, 0);
                this._throwIfCancelled();
                if (bytesRead >= 12 &&
                    buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
                    buf[8] === 0x57 && buf[9] === 0x41 && buf[10] === 0x56 && buf[11] === 0x45) {
                    return true; // "RIFF" ... "WAVE"
                }
                return false;
            } finally {
                try { await fd.close(); } catch { /* ignore */ }
            }
        } catch (err) {
            this._throwIfCancelled();
            this._debugLog(`[OnlineTTS][Debug] Validate wav failed ${filePath} err=${err ? err.message : err}`);
            return true;
        }
    }

    async _cleanupInvalidFiles(packPath, audioFiles) {
        this._throwIfCancelled();
        if (audioFiles.length === 0) return;
        let removed = 0;
        await this._forEachFile(audioFiles, async file => {
            const target = path.join(packPath, file.name);
            if (!await this._fileExists(target)) return;
            const ok = await this._isLikelyValidWav(target);
            if (ok) return;
            try {
                this._throwIfCancelled();
                await fs.promises.unlink(target);
                this._throwIfCancelled();
                removed += 1;
                this._debugLog(`[OnlineTTS][Debug] Removed invalid wav ${target}`);
            } catch (err) {
                this._throwIfCancelled();
                this._debugLog(`[OnlineTTS][Debug] Failed to remove invalid wav ${target} err=${err ? err.message : err}`);
            }
        });
        if (removed > 0) {
            this._debugLog(`[OnlineTTS][Debug] Cleanup removed ${removed} invalid file(s)`);
        }
    }

    async downloadFile(url, targetPath, options = {}) {
        this._throwIfCancelled();
        const maxRetries = Number.isInteger(options.retries) ? options.retries : 3;
        const baseDelayMs = Number.isInteger(options.retryDelayMs) ? options.retryDelayMs : 500;
        const timeoutMs = Number.isInteger(options.timeoutMs) ? options.timeoutMs : 30000;

        const isRetryableError = (err) => {
            if (!err) return false;
            const code = err.code;
            if (code && RETRYABLE_ERROR_CODES.has(code)) return true;
            return RETRYABLE_STATUS_CODES.has(err.statusCode);
        };

        for (let attempt = 0; ; attempt += 1) {
            this._throwIfCancelled();
            let writing = false;
            try {
                const data = await this._requestBuffer(url, timeoutMs, { "User-Agent": "tera-guide-tts-cache" });
                this._throwIfCancelled();
                await fs.promises.mkdir(path.dirname(targetPath), { recursive: true });
                this._throwIfCancelled();
                writing = true;
                await fs.promises.writeFile(targetPath, data);
                this._throwIfCancelled();
                return;
            } catch (err) {
                this._throwIfCancelled();
                if (writing) {
                    try {
                        this._throwIfCancelled();
                        await fs.promises.unlink(targetPath);
                    } catch { /* ignore cleanup errors */ }
                    this._throwIfCancelled();
                }
                if (attempt >= maxRetries || !isRetryableError(err)) throw err;
                const delay = baseDelayMs * Math.pow(2, attempt);
                this._debugLog(`[OnlineTTS][Debug] Retry ${attempt + 1}/${maxRetries} after ${delay}ms for ${url} err=${err ? err.message : err}`);
                await this._waitRetry(delay);
            }
        }
    }
}

module.exports = TTSDownload;
