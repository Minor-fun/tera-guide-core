"use strict";

const fs = require('fs');
const path = require('path');
const https = require('https');
const AudioPlayer = require('./utils/audioPlayer');

class OnlineTTS {
    /**
     * Create online TTS instance
     * @param {Object} settings Configuration object
     */
    constructor(settings = {}) {
        this.rootDir = path.join(__dirname, '..');
        this.configPath = path.join(this.rootDir, 'config.json');
        
        const defaultConfig = {
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
        
        this.settings = this._loadConfig(defaultConfig);
        this._ensureCacheDirs();
        this.audioPlayer = new AudioPlayer();
    }

    /**
     * Load configuration
     * @param {Object} defaultConfig Default configuration
     * @returns {Object} Loaded configuration
     * @private
     */
    _loadConfig(defaultConfig) {
        try {
            if (fs.existsSync(this.configPath)) {
                const config = JSON.parse(fs.readFileSync(this.configPath, 'utf8'));
                return { ...defaultConfig, ...config };
            } else {
                fs.writeFileSync(this.configPath, JSON.stringify(defaultConfig, null, 4), 'utf8');
                return { ...defaultConfig };
            }
        } catch (err) {
            console.error(`Failed to load configuration file: ${err.message}`);
            return { ...defaultConfig };
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
     * Update configuration and save
     * @param {Object} config Configuration to save
     * @private
     */
    _saveConfig() {
        try {
            fs.writeFileSync(this.configPath, JSON.stringify(this.settings, null, 4), 'utf8');
        } catch (err) {
            console.error(`Failed to save configuration file: ${err.message}`);
        }
    }
    
    /**
     * Get actual cache directory path
     * @returns {string} Actual cache path
     * @private
     */
    _getActualCachePath() {
        return path.join(__dirname, '..', this.settings.cacheDir);
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
     * @param {number} maxLength Maximum filename length
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
     * Check if corresponding audio file exists in cache
     * @param {string} text Text content
     * @param {string} voiceName Voice name
     * @returns {boolean} Whether exists
     */
    hasCachedAudio(text, voiceName = this.settings.defaultVoice) {
        return fs.existsSync(this._getCacheFilePath(text, voiceName));
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
        return this.settings.voices[voiceName] || this.settings.voices[this.settings.defaultVoice];
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
                return reject(new Error(!this.settings.apiKey ? 'API key not set' : 'Invalid voice ID, please add a voice first'));
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
                        const filePath = this._getCacheFilePath(text, voiceName);
                        fs.writeFileSync(filePath, Buffer.concat(dataChunks));
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
     * Convert numbers in text to English words
     * @param {string} text Text that may contain numbers
     * @returns {string} Text with numbers converted to English words
     * @private
     */
    _convertNumbersToEnglish(text) {
        if (!text) return text;
        
        const numberWords = {
            0: 'zero', 1: 'one', 2: 'two', 3: 'three', 4: 'four',
            5: 'five', 6: 'six', 7: 'seven', 8: 'eight', 9: 'nine',
            10: 'ten', 11: 'eleven', 12: 'twelve', 13: 'thirteen', 14: 'fourteen',
            15: 'fifteen', 16: 'sixteen', 17: 'seventeen', 18: 'eighteen', 19: 'nineteen',
            20: 'twenty', 30: 'thirty', 40: 'forty', 50: 'fifty',
            60: 'sixty', 70: 'seventy', 80: 'eighty', 90: 'ninety'
        };
        
        // 处理两位数
        function processTwoDigits(num) {
            num = parseInt(num);
            if (num <= 20) return numberWords[num];
            const tens = Math.floor(num / 10) * 10;
            const ones = num % 10;
            return ones === 0 ? numberWords[tens] : `${numberWords[tens]} ${numberWords[ones]}`;
        }
        
        // 处理三位数
        function processThreeDigits(num) {
            num = parseInt(num);
            if (num < 100) return processTwoDigits(num);
            const hundreds = Math.floor(num / 100);
            const remainder = num % 100;
            return remainder === 0 ? 
                `${numberWords[hundreds]} hundred` : 
                `${numberWords[hundreds]} hundred ${processTwoDigits(remainder)}`;
        }
        
        // 处理四位数 (1000-9999)
        function processFourDigits(num) {
            num = parseInt(num);
            if (num < 1000) return processThreeDigits(num);
            const thousands = Math.floor(num / 1000);
            const remainder = num % 1000;
            return remainder === 0 ? 
                `${numberWords[thousands]} thousand` : 
                `${numberWords[thousands]} thousand ${processThreeDigits(remainder)}`;
        }
        
        // 使用正则表达式匹配独立的数字
        return text.replace(/\b\d+\b/g, match => {
            const num = parseInt(match);
            // 只处理10000以内的数字
            if (num >= 0 && num < 10000) {
                if (num === 0) return 'zero';
                if (num < 10000) return processFourDigits(num);
            }
            return match; // 超出范围的数字保持原样
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
        if (!this.isAvailable()) {
            return Promise.reject(new Error(!this.settings.enabled ? 
                'Online TTS not enabled' : 'API key not set, unable to use online TTS service'));
        }
        
        if (Object.keys(this.settings.voices || {}).length === 0) {
            return Promise.reject(new Error('No voices set, please add a voice first'));
        }
        
        if (!voiceName && !this.settings.defaultVoice) {
            voiceName = Object.keys(this.settings.voices)[0];
        }
        
        // 转换数字为英文单词
        const processedText = this._convertNumbersToEnglish(text);
        
        const filePath = this._getCacheFilePath(processedText, voiceName);
        try {
            if (fs.existsSync(filePath)) {
                return this.playAudio(filePath);
            } else {
                await this._fetchAudioFromAPI(processedText, voiceName);
                return Promise.resolve();
            }
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
        if (!this.isAvailable()) {
            return Promise.reject(new Error(!this.settings.enabled ? 
                'Online TTS not enabled' : 'API key not set, unable to use online TTS service'));
        }
        
        if (Object.keys(this.settings.voices || {}).length === 0) {
            return Promise.reject(new Error('No voices set, please add a voice first'));
        }
        
        if (!voiceName && !this.settings.defaultVoice) {
            voiceName = Object.keys(this.settings.voices)[0];
        }
        
        // 转换数字为英文单词
        const processedText = this._convertNumbersToEnglish(text);
        
        const filePath = this._getCacheFilePath(processedText, voiceName);
        try {
            if (!fs.existsSync(filePath)) {
                await this._fetchAudioFromAPI(processedText, voiceName);
            }
            return Promise.resolve(filePath);
        } catch (err) {
            console.error(`TTS generation failed: ${err.message}`);
            return Promise.reject(err);
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
     * @param {string} key Configuration item name or configuration object
     * @param {any} value Configuration item value (used when key is string)
     * @param {boolean} validate Whether to validate value (optional)
     * @returns {any} Actually set value or undefined
     */
    updateConfig(key, value, validate = false) {
        if (typeof key === 'object') {
            this.settings = { ...this.settings, ...key };
            this._saveConfig();
            if (key.voices) this._ensureCacheDirs();
            return this.settings;
        }
        
        if (typeof key === 'string') {
            let finalValue = value;
            if (validate) {
                switch(key) {
                    case 'enabled': finalValue = !!value; break;
                    case 'rate': finalValue = Math.max(0.5, Math.min(5, parseFloat(value) || 1)); break;
                    case 'volume': finalValue = Math.max(0, Math.min(100, parseInt(value) || 90)); break;
                    case 'defaultVoice': 
                        if (!this.settings.voices || !this.settings.voices[value]) return false;
                        break;
                }
            }
            this.settings[key] = finalValue;
            this._saveConfig();
            return finalValue;
        }
        return undefined;
    }

    /**
     * Set voice
     * @param {string} name Voice name
     * @param {string} id Voice ID
     */
    setVoice(name, id) {
        if (!this.settings.voices) this.settings.voices = {};
        this.settings.voices[name] = id;
        if (Object.keys(this.settings.voices).length === 1) {
            this.settings.defaultVoice = name;
        }
        this._saveConfig();
        this._ensureDir(path.join(this._getActualCachePath(), name));
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
        this._saveConfig();
        
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
     * Set API key
     * @param {string} apiKey API key
     */
    setApiKey(apiKey) { return this.updateConfig('apiKey', apiKey); }
    
    /**
     * Set enabled status
     * @param {boolean} enabled Whether enabled
     */
    setEnabled(enabled) { return this.updateConfig('enabled', enabled, true); }
    
    /**
     * Set default voice
     * @param {string} name Voice name
     * @returns {boolean} Whether successful
     */
    setDefaultVoice(name) { return this.updateConfig('defaultVoice', name, true); }
    
    /**
     * Set speech rate
     * @param {number} rate Speech rate value (0.5-5)
     * @returns {number} Actually set rate value
     */
    setRate(rate) { return this.updateConfig('rate', rate, true); }
    
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
}

module.exports = OnlineTTS; 