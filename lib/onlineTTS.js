"use strict";

const fs = require('fs');
const path = require('path');
const https = require('https');
const AudioPlayer = require('./utils/audioPlayer');
const TextUtils = require('./utils/textUtils');

const DEFAULT_CONFIG = {
    "enabled": false,
    "apiKey": "",
    "apiEndpoint": "https://api.espai.fun/ai_api/tts",
    "voices": {},
    "defaultVoice": "",
    "sampleRate": 24000,
    "volume": 90,
    "rate": 1,
    "cacheDir": "tts_cache"
};

class OnlineTTS {
    /**
     * Create online TTS instance
     * @param {Object} settings Configuration object
     */
    constructor(settings = {}) {
        this.rootDir = path.join(__dirname, '..');
        
        // Only extract necessary parameters from settings
        const userSettings = {};
        ['apiKey', 'voices', 'rate', 'enabled', 'defaultVoice'].forEach(key => {
            if (settings[key] !== undefined) userSettings[key] = settings[key];
        });
        
        this.settings = { ...DEFAULT_CONFIG, ...userSettings };
        this._ensureCacheDirs();
        this.audioPlayer = new AudioPlayer();
    }

    /**
     * Ensure directory exists
     * @param {string} dir Directory path
     * @param {string} dirType Directory type description
     * @private
     */
    _ensureDir(dir, dirType = '') {
        if (!fs.existsSync(dir)) {
            try {
                fs.mkdirSync(dir, { recursive: true });
            } catch (err) {
                console.error(`Failed to create ${dirType} directory: ${err.message}`);
            }
        }
        return dir;
    }
    
    /**
     * Get actual cache directory path
     * @returns {string} Actual cache path
     * @private
     */
    _getActualCachePath() {
        return path.join(this.rootDir, this.settings.cacheDir);
    }

    /**
     * Ensure all cache directories exist
     * @private
     */
    _ensureCacheDirs() {
        const cachePath = this._ensureDir(this._getActualCachePath());
        Object.keys(this.settings.voices || {}).forEach(voiceName => {
            this._ensureDir(path.join(cachePath, voiceName));
        });
    }

    /**
     * Convert text to valid filename
     * @param {string} text Text content
     * @param {number} maxLength Maximum filename lengthmp3
     * @returns {string} Valid filename
     * @private
     */
    _textToFileName(text, maxLength = 100) {
        let processedText = text.trim()
            .replace(/[.,!?;:，。！？；：、""''()（）【】[\]]/g, '')
            .replace(/[\\/:*?"<>|]/g, '_')
            .replace(/\s+/g, '_')
            .replace(/_+/g, '_')
            .replace(/^_|_$/g, '');
        
        return (processedText.length > maxLength) ? 
            processedText.substring(0, maxLength) : (processedText || 'tts_audio');
    }

    /**
     * Get cached audio file path
     * @param {string} text Text content
     * @param {string} voiceName Voice name
     * @returns {string} File path
     * @private
     */
    _getCacheFilePath(text, voiceName) {
        return path.join(this._getActualCachePath(), voiceName, `${this._textToFileName(text)}.mp3`);
    }

    /**
     * Check if a voice name is English
     * @param {string} voiceName Voice name
     * @returns {boolean} Whether it's an English voice
     * @private
     */
    _isEnglishVoice(voiceName) {
        const voice = this.settings.voices ? this.settings.voices[voiceName] : null;
        if (voice && typeof voice === 'object' && voice.lang) {
            return voice.lang.toLowerCase().startsWith('en');
        }
        // Check if the voice name contains only English characters and spaces
        return /^[a-zA-Z\s]+$/.test(voiceName);
    }

    /**
     * Convert numbers in text to English words and replace + with "plus"
     * @param {string} text Text that may contain numbers and + symbols
     * @param {string} voiceName Voice name to determine if conversion is needed
     * @returns {string} Text with numbers converted to English words and + replaced with "plus"
     * @private
     */
    _convertNumbersToEnglish(text, voiceName) {
        if (!text) return text;
        if (!voiceName || !this._isEnglishVoice(voiceName)) return text;
        return TextUtils.convertNumbersToEnglish(text);
    }

    /**
     * Check if corresponding audio file exists in cache
     * @param {string} text Text content
     * @param {string} voiceName Voice name
     * @returns {boolean} Whether exists
     */
    hasCachedAudio(text, voiceName = this.settings.defaultVoice) {
        // Process the text first, then check the cache
        const processedText = this._convertNumbersToEnglish(text, voiceName);
        return fs.existsSync(this._getCacheFilePath(processedText, voiceName));
    }

    /**
     * Get voice ID
     * @param {string} voiceName Voice name
     * @returns {string} Voice ID
     * @private
     */
    _getVoiceId(voiceName) {
        if (!voiceName || !this.settings.voices || Object.keys(this.settings.voices).length === 0) {
            return null;
        }
        const voice = this.settings.voices[voiceName] || this.settings.voices[this.settings.defaultVoice];
        return (typeof voice === 'object' && voice.id) ? voice.id : voice;
    }

    /**
     * Check if TTS function is available
     * @returns {boolean} Whether available
     */
    isAvailable() {
        return this.settings.enabled && !!this.settings.apiKey;
    }

    /**
     * Play local audio file
     * @param {string} filePath Audio file path
     * @returns {Promise<void>}
     */
    playAudio(filePath) {
        return this.audioPlayer.play(filePath, { volume: this.settings.volume });
    }

    /**
     * Get TTS audio from API and save locally
     * @param {string} text Text to convert
     * @param {string} voiceName Voice name
     * @returns {Promise<string>} Audio file path
     * @private
     */
    _fetchAudioFromAPI(text, voiceName) {
        return new Promise((resolve, reject) => {
            if (!text || typeof text !== 'string') {
                return reject(new Error('Invalid text parameter'));
            }
            
            const voiceId = this._getVoiceId(voiceName);
            if (!this.settings.apiKey || !voiceId) {
                return reject(new Error(!this.settings.apiKey ? 'API key not set' : 'Invalid voice ID'));
            }
            
            const postData = JSON.stringify({
                text, reference_id: voiceId, api_key: this.settings.apiKey,
                sample_rate: this.settings.sampleRate, volume: this.settings.volume, rate: this.settings.rate
            });

            const url = new URL(this.settings.apiEndpoint);
            const options = {
                hostname: url.hostname,
                port: url.port || 443,
                path: url.pathname + url.search,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(postData),
                    'Accept': 'audio/mpeg', 
                    'Cache-Control': 'no-cache',
                    'Connection': 'keep-alive'
                }
            };
            
            const req = https.request(options, (res) => {
                if (res.statusCode !== 200) {
                    return reject(new Error(`API request failed, status code: ${res.statusCode}`));
                }

                const dataChunks = [];
                res.on('data', chunk => dataChunks.push(chunk));
                res.on('end', () => {
                    try {
                        const audioData = Buffer.concat(dataChunks);
                        
                        if (!audioData || audioData.length < 100) {
                            return reject(new Error('Received invalid or empty audio data'));
                        }
                        
                        const filePath = this._getCacheFilePath(text, voiceName);
                        fs.writeFileSync(filePath, audioData);
                        resolve(filePath);
                    } catch (err) {
                        reject(new Error(`Failed to save audio file: ${err.message}`));
                    }
                });
            });
            
            req.on('error', err => reject(new Error(`API request failed: ${err.message}`)));
            req.setTimeout(10000, () => { req.abort(); reject(new Error('API request timeout')); });
            req.write(postData);
            req.end();
        });
    }

    /**
     * Play audio file corresponding to text
     * If exists in cache, play directly; otherwise get from API and play
     * @param {string} text Text to play
     * @param {string} voiceName Voice name
     * @returns {Promise<void>}
     */
    async speak(text, voiceName = this.settings.defaultVoice) {
        try {
            const filePath = await this.generateAudio(text, voiceName);
            return this.playAudio(filePath);
        } catch (err) {
            console.error(`TTS processing failed: ${err.message}`);
            return Promise.reject(err);
        }
    }

    /**
     * Generate TTS audio without playing
     * @param {string} text Text to convert
     * @param {string} voiceName Voice name
     * @returns {Promise<string>} Audio file path
     */
    async generateAudio(text, voiceName = this.settings.defaultVoice) {
        try {
            const { processedText, filePath, voiceName: voice } = await this._validateAndPrepare(text, voiceName);
            
            if (!fs.existsSync(filePath)) {
                await this._fetchAudioFromAPI(processedText, voice);
            }
            return filePath;
        } catch (err) {
            console.error(`TTS generation failed: ${err.message}`);
            throw err;
        }
    }

    /**
     * Stop current playback
     */
    stop() {
        this.audioPlayer.stop();
    }

    /**
     * Update configuration
     * @param {Object} settings New settings object
     */
    updateSettings(settings) {
        if (!settings) return;
        
        // Only process allowed parameters
        const userSettings = {};
        ['apiKey', 'voices', 'rate', 'enabled', 'defaultVoice'].forEach(key => {
            if (settings[key] !== undefined) userSettings[key] = settings[key];
        });
        
        if (userSettings.rate !== undefined) {
            userSettings.rate = Math.max(0.5, Math.min(5, parseFloat(userSettings.rate) || 1));
        }
        
        const oldSettings = { ...this.settings };
        this.settings = { ...this.settings, ...userSettings };
        
        // If voices change, ensure the cache directory exists
        if (JSON.stringify(oldSettings.voices) !== JSON.stringify(this.settings.voices)) {
            this._ensureCacheDirs();
        }
        
        return this.settings;
    }

    /**
     * Set voice
     * @param {string} name Voice name
     * @param {string} id Voice ID
     * @param {string} lang Voice language (optional)
     */
    setVoice(name, id, lang = null) {
        if (!this.settings.voices) this.settings.voices = {};
        this.settings.voices[name] = lang ? { id, lang } : id;
        if (Object.keys(this.settings.voices).length === 1) {
            this.settings.defaultVoice = name;
        }
        this._ensureDir(path.join(this._getActualCachePath(), name));
        return { name, id, lang };
    }

    /**
     * Delete voice
     * @param {string} name Voice name
     * @returns {boolean} Whether deletion was successful
     */
    deleteVoice(name) {
        if (!this.settings.voices || !this.settings.voices[name] || this.settings.defaultVoice === name) {
            return false;
        }
        
        delete this.settings.voices[name];
        
        try {
            const cachePath = path.join(this._getActualCachePath(), name);
            if (fs.existsSync(cachePath)) {
                fs.readdirSync(cachePath).forEach(file => {
                    try { fs.unlinkSync(path.join(cachePath, file)); } catch (e) {}
                });
            }
        } catch (e) {
            console.error(`Failed to delete voice cache directory: ${e.message}`);
        }
        return true;
    }

    /**
     * Get voice for language
     * @param {string} lang Language code
     * @returns {string|null} Voice name
     */
    getVoiceForLanguage(lang) {
        if (!this.settings.voices || !lang) return null;
        
        const lowerLang = lang.toLowerCase();
        
        // Priority: Exact match (e.g. voice "zh_hans" for input "zh_hans")
        for (const [name, voice] of Object.entries(this.settings.voices)) {
            if (typeof voice === 'object' && voice.lang && voice.lang.toLowerCase() === lowerLang) {
                return name;
            }
        }
        
        return null;
    }

    /**
     * Get voice list
     * @returns {Object} Voice list
     */
    getVoices() { return { ...this.settings.voices }; }
    
    /**
     * Get current configuration
     * @returns {Object} Current configuration
     */
    getConfig() { return { ...this.settings }; }

    /**
     * Test API connection
     * @param {string} text Test text
     * @param {string} voiceName Voice name
     * @returns {Promise<boolean>} Test result
     */
    testAPI(text = "This is a test", voiceName = null) {
        if (!this.isAvailable()) return Promise.resolve(false);
        const testVoice = voiceName || this.settings.defaultVoice;
        return this.speak(text, testVoice).then(() => true).catch(() => false);
    }

    async _validateAndPrepare(text, voiceName = this.settings.defaultVoice) {
        if (!this.isAvailable()) {
            throw new Error(!this.settings.enabled ? 'Online TTS not enabled' : 'API key not set');
        }
        
        if (Object.keys(this.settings.voices || {}).length === 0) {
            throw new Error('No voices set, please add a voice first');
        }
        
        if (!voiceName && !this.settings.defaultVoice) {
            voiceName = Object.keys(this.settings.voices)[0];
        }
        
        // Convert numbers to English words, determine if conversion is needed based on the voice
        const processedText = this._convertNumbersToEnglish(text, voiceName);
        const filePath = this._getCacheFilePath(processedText, voiceName);
        
        return { processedText, filePath, voiceName };
    }
}

module.exports = OnlineTTS; 