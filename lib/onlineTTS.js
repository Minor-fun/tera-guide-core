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
     * @param {string} settings.basePath - Base path for cache directory (optional)
     * @param {string} settings.cacheDir - Cache directory name (default: "tts_cache")
     */
    constructor(settings = {}) {
        // Support external basePath for cache directory
        this.basePath = settings.basePath || path.join(__dirname, '..');
        
        // Only extract necessary parameters from settings
        const userSettings = {};
        ['apiKey', 'voices', 'rate', 'enabled', 'defaultVoice', 'cacheDir'].forEach(key => {
            if (settings[key] !== undefined) userSettings[key] = settings[key];
        });
        
        this.settings = { ...DEFAULT_CONFIG, ...userSettings };
        
        // Auto-detect cached voices and merge with user config
        this._mergeDetectedVoices();
        
        this._ensureCacheDirs();
        this.audioPlayer = new AudioPlayer();
    }

    /**
     * Merge auto-detected cached voices with user configuration
     * User-configured voices take precedence (preserve their IDs)
     * @private
     */
    _mergeDetectedVoices() {
        const cachePath = path.join(this.basePath, this.settings.cacheDir);
        const detectedVoices = OnlineTTS.detectCachedVoices(cachePath);
        
        // Merge: user config takes precedence
        const userVoices = this.settings.voices || {};
        const mergedVoices = { ...detectedVoices };
        
        // Override with user-configured voices (preserve user IDs)
        for (const [name, config] of Object.entries(userVoices)) {
            mergedVoices[name] = config;
        }
        
        this.settings.voices = mergedVoices;
        
        // Set default voice if not configured and voices exist
        if (!this.settings.defaultVoice && Object.keys(mergedVoices).length > 0) {
            this.settings.defaultVoice = Object.keys(mergedVoices)[0];
        }
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
        return path.join(this.basePath, this.settings.cacheDir);
    }

    /**
     * Ensure all cache directories exist
     * @private
     */
    _ensureCacheDirs() {
        const cachePath = this._ensureDir(this._getActualCachePath());
        // Create directories for each configured voice based on its language
        const voices = this.settings.voices || {};
        
        Object.keys(voices).forEach(voiceName => {
            const voice = voices[voiceName];
            const lang = (typeof voice === 'object' && voice.lang) ? voice.lang.toLowerCase() : 'default';
            const langDir = path.join(cachePath, lang);
            this._ensureDir(langDir);
            this._ensureDir(path.join(langDir, voiceName));
        });
    }

    /**
     * Preprocess text before sending to TTS API
     * Converts symbols that TTS models cannot understand to spaces
     * @param {string} text Original text
     * @returns {string} Preprocessed text for TTS API
     */
    static preprocessTextForTTS(text) {
        if (!text) return text;
        return text
            .replace(/[→←↑↓_]/g, ' ')  // Replace arrows and underscores with spaces
            .replace(/\s+/g, ' ')       // Merge multiple spaces
            .trim();                     // Remove leading/trailing spaces
    }

    /**
     * Convert text to valid filename (exported for external use)
     * @param {string} text Text content
     * @param {number} maxLength Maximum filename length
     * @returns {string} Valid filename
     */
    static textToFileName(text, maxLength = 100) {
        let processedText = text.trim()
            .replace(/[.,!?;:，。！？；：、""''()（）【】[\]]/g, '')
            .replace(/[\\/:*?"<>|#%=&+]/g, '_')  // Added # % = & + for URL compatibility
            .replace(/\s+/g, '_')
            .replace(/_+/g, '_')
            .replace(/^_|_$/g, '');
        
        return (processedText.length > maxLength) ? 
            processedText.substring(0, maxLength) : (processedText || 'tts_audio');
    }

    /**
     * Detect cached voices from tts_cache directory structure
     * Scans {cachePath}/{lang}/{voiceName}/ directories
     * @param {string} cachePath - Path to tts_cache directory
     * @returns {Object} Detected voices in format { voiceName: { id: '', lang: 'xx' } }
     */
    static detectCachedVoices(cachePath) {
        const voices = {};
        
        try {
            if (!fs.existsSync(cachePath)) {
                return voices;
            }
            
            // Scan language directories
            const langDirs = fs.readdirSync(cachePath, { withFileTypes: true })
                .filter(dirent => dirent.isDirectory())
                .map(dirent => dirent.name);
            
            for (const lang of langDirs) {
                const langPath = path.join(cachePath, lang);
                
                // Scan voice directories within each language
                const voiceDirs = fs.readdirSync(langPath, { withFileTypes: true })
                    .filter(dirent => dirent.isDirectory())
                    .map(dirent => dirent.name);
                
                for (const voiceName of voiceDirs) {
                    // Only add if not already detected (first occurrence wins)
                    if (!voices[voiceName]) {
                        voices[voiceName] = {
                            id: '',  // Placeholder ID for cache-only voices
                            lang: lang
                        };
                    }
                }
            }
        } catch (err) {
            console.error(`Failed to detect cached voices: ${err.message}`);
        }
        
        return voices;
    }

    /**
     * Instance method for textToFileName
     * @param {string} text Text content
     * @param {number} maxLength Maximum filename length
     * @returns {string} Valid filename
     * @private
     */
    _textToFileName(text, maxLength = 100) {
        return OnlineTTS.textToFileName(text, maxLength);
    }

    /**
     * Get cached audio file path (organized by language and voice)
     * @param {string} text Text for filename (translated text)
     * @param {string} lang Language code
     * @param {string} voiceName Voice name
     * @returns {string} File path
     * @private
     */
    _getCacheFilePath(text, lang, voiceName) {
        const langDir = (lang || 'default').toLowerCase();
        const voice = voiceName || this.settings.defaultVoice;
        return path.join(this._getActualCachePath(), langDir, voice, `${this._textToFileName(text)}.mp3`);
    }

    /**
     * Check if text contains template variables
     * @param {string} text Text to check
     * @returns {boolean} Whether contains template variables
     */
    _hasTemplateVariables(text) {
        if (!text) return false;
        return /\{[^}]+\}/.test(text);
    }

    /**
     * Check if a voice/language is English
     * @param {string} lang Language code
     * @returns {boolean} Whether it's English
     * @private
     */
    _isEnglishLang(lang) {
        if (!lang) return false;
        return lang.toLowerCase().startsWith('en');
    }

    /**
     * Convert numbers in text to English words (only for English)
     * @param {string} text Text that may contain numbers
     * @param {string} lang Language code
     * @returns {string} Processed text
     * @private
     */
    _convertNumbersToEnglish(text, lang) {
        if (!text) return text;
        if (!this._isEnglishLang(lang)) return text;
        return TextUtils.convertNumbersToEnglish(text);
    }

    /**
     * Check if corresponding audio file exists in cache
     * @param {string} text Text for filename (translated text)
     * @param {string} lang Language code
     * @param {string} voiceName Voice name
     * @returns {boolean} Whether exists
     */
    hasCachedAudio(text, lang = null, voiceName = null) {
        const voice = voiceName || this.settings.defaultVoice || this.getVoiceForLanguage(lang);
        return fs.existsSync(this._getCacheFilePath(text, lang, voice));
    }

    /**
     * Validate MP3 audio data
     * @param {Buffer} data Audio data buffer
     * @returns {boolean} Whether data is valid MP3
     */
    static isValidMP3(data) {
        if (!data || data.length < 100) return false;
        
        const header = data.slice(0, 3);
        
        // ID3 tag header (0x49 0x44 0x33 = "ID3") - most common for TTS output
        if (header[0] === 0x49 && header[1] === 0x44 && header[2] === 0x33) {
            return true;
        }
        
        // MP3 frame sync (0xFF followed by 0xE0-0xFF)
        if (header[0] === 0xFF && (header[1] & 0xE0) === 0xE0) {
            return true;
        }
        
        return false;
    }

    /**
     * Instance method for isValidMP3
     * @param {Buffer} data Audio data buffer
     * @returns {boolean} Whether data is valid MP3
     * @private
     */
    _isValidMP3(data) {
        return OnlineTTS.isValidMP3(data);
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
     * Check if TTS function is available (has API key for generating new audio)
     * @returns {boolean} Whether available for API calls
     */
    isAvailable() {
        return this.settings.enabled && !!this.settings.apiKey;
    }

    /**
     * Check if TTS is enabled (can play cached audio even without API key)
     * @returns {boolean} Whether enabled
     */
    isEnabled() {
        return this.settings.enabled;
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
     * @param {string} text Text to convert (actual text for TTS)
     * @param {string} voiceName Voice name
     * @param {string} filePath File path to save
     * @returns {Promise<string>} Audio file path
     * @private
     */
    _fetchAudioFromAPI(text, voiceName, filePath) {
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
                        
                        // Validate MP3 data
                        if (!this._isValidMP3(audioData)) {
                            return reject(new Error('Received invalid audio data (not a valid MP3 file)'));
                        }
                        
                        // Ensure directory exists
                        const dir = path.dirname(filePath);
                        this._ensureDir(dir);
                        
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
     * @param {string} text Text to speak (used for both TTS and filename)
     * @param {string} lang Language code
     * @param {string} voiceName Voice name (optional)
     * @returns {Promise<void>}
     */
    async speak(text, lang = null, voiceName = null) {
        // Skip if text contains template variables
        if (this._hasTemplateVariables(text)) {
            return Promise.resolve();
        }

        try {
            const filePath = await this.generateAudio(text, lang, voiceName);
            return this.playAudio(filePath);
        } catch (err) {
            console.error(`TTS processing failed: ${err.message}`);
            return Promise.reject(err);
        }
    }

    /**
     * Generate TTS audio without playing
     * @param {string} text Text to convert (used for both TTS and filename)
     * @param {string} lang Language code
     * @param {string} voiceName Voice name (optional)
     * @returns {Promise<string>} Audio file path
     */
    async generateAudio(text, lang = null, voiceName = null) {
        try {
            // Determine voice to use
            let voice = voiceName || this.settings.defaultVoice || this.getVoiceForLanguage(lang);
            if (!voice && this.settings.voices) {
                voice = Object.keys(this.settings.voices)[0];
            }
            
            // Check cache first (before validating API availability)
            const filePath = this._getCacheFilePath(text, lang, voice);
            if (fs.existsSync(filePath)) {
                return filePath;
            }
            
            // No cache, need to generate - validate API availability
            const { processedText } = this._validateAndPrepare(text, lang, voiceName);
            await this._fetchAudioFromAPI(processedText, voice, filePath);
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
        ['apiKey', 'voices', 'rate', 'enabled', 'defaultVoice', 'cacheDir', 'basePath'].forEach(key => {
            if (settings[key] !== undefined) userSettings[key] = settings[key];
        });
        
        if (userSettings.rate !== undefined) {
            userSettings.rate = Math.max(0.5, Math.min(5, parseFloat(userSettings.rate) || 1));
        }
        
        // Update basePath if provided
        if (userSettings.basePath) {
            this.basePath = userSettings.basePath;
            delete userSettings.basePath;
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
        
        // Create cache directory for this voice
        const langDir = lang ? lang.toLowerCase() : 'default';
        this._ensureDir(path.join(this._getActualCachePath(), langDir, name));
        
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
        return true;
    }

    /**
     * Get a voice that matches the specified language
     * @param {string} lang Language code
     * @returns {string|null} Voice name
     */
    getVoiceForLanguage(lang) {
        if (!lang) return null;
        
        const lowerLang = lang.toLowerCase();
        
        // Find a voice with matching language
        if (this.settings.voices) {
            for (const [name, voice] of Object.entries(this.settings.voices)) {
                if (typeof voice === 'object' && voice.lang && voice.lang.toLowerCase() === lowerLang) {
                    return name;
                }
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
     * Test TTS playback (cache-first, then API if available)
     * @param {string} text Test text
     * @param {string} voiceName Voice name
     * @returns {Promise<boolean>} Test result
     */
    async testAPI(text = "This is a test", voiceName = null) {
        // Check if TTS is enabled (required for any playback)
        if (!this.isEnabled()) return false;
        
        const testVoice = voiceName || this.settings.defaultVoice;
        if (!testVoice) return false;
        
        // Get voice language for proper directory
        const voice = this.settings.voices ? this.settings.voices[testVoice] : null;
        const lang = (typeof voice === 'object' && voice.lang) ? voice.lang : null;
        
        try {
            // Use speak which already has cache-first logic
            await this.speak(text, lang, testVoice);
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Validate and prepare for TTS generation
     * @param {string} text Text to convert (used for both TTS and filename)
     * @param {string} lang Language code
     * @param {string} voiceName Voice name
     * @returns {Object} { processedText, filePath, voice }
     * @private
     */
    _validateAndPrepare(text, lang = null, voiceName = null) {
        if (!this.isAvailable()) {
            throw new Error(!this.settings.enabled ? 'Online TTS not enabled' : 'API key not set');
        }
        
        if (Object.keys(this.settings.voices || {}).length === 0) {
            throw new Error('No voices set, please add a voice first');
        }
        
        // Determine voice to use
        let voice = voiceName;
        if (!voice) {
            voice = this.settings.defaultVoice || this.getVoiceForLanguage(lang);
        }
        if (!voice) {
            voice = Object.keys(this.settings.voices)[0];
        }
        
        // Convert numbers to English words for English language, then preprocess for TTS
        const processedText = OnlineTTS.preprocessTextForTTS(
            this._convertNumbersToEnglish(text, lang)
        );
        
        // File path is based on original text (translated text as filename)
        const filePath = this._getCacheFilePath(text, lang, voice);
        
        return { processedText, filePath, voice };
    }
}

module.exports = OnlineTTS;
