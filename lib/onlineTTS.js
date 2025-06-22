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
        
        // Hardcode most parameters, only apiKey, voices, and rate need user configuration
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
        
        // Only extract necessary parameters from settings
        const userSettings = {};
        ['apiKey', 'voices', 'rate', 'enabled', 'defaultVoice'].forEach(key => {
            if (settings[key] !== undefined) userSettings[key] = settings[key];
        });
        
        this.settings = { ...defaultConfig, ...userSettings };
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
        
        // Only perform conversion for English voices
        if (!voiceName || !this._isEnglishVoice(voiceName)) {
            return text;
        }
        
        // Replace basic symbols and text
        text = text.replace(/\+/g, ' plus ').replace(/\bAoE\b/g, 'AOE');
        
        const numberWords = {
            0: 'zero', 1: 'one', 2: 'two', 3: 'three', 4: 'four', 5: 'five', 
            6: 'six', 7: 'seven', 8: 'eight', 9: 'nine', 10: 'ten', 
            11: 'eleven', 12: 'twelve', 13: 'thirteen', 14: 'fourteen', 15: 'fifteen',
            16: 'sixteen', 17: 'seventeen', 18: 'eighteen', 19: 'nineteen',
            20: 'twenty', 30: 'thirty', 40: 'forty', 50: 'fifty',
            60: 'sixty', 70: 'seventy', 80: 'eighty', 90: 'ninety'
        };
        
        const ordinalWords = {
            1: 'first', 2: 'second', 3: 'third', 4: 'fourth', 5: 'fifth',
            6: 'sixth', 7: 'seventh', 8: 'eighth', 9: 'ninth', 10: 'tenth',
            11: 'eleventh', 12: 'twelfth', 13: 'thirteenth', 14: 'fourteenth', 15: 'fifteenth',
            16: 'sixteenth', 17: 'seventeenth', 18: 'eighteenth', 19: 'nineteenth', 20: 'twentieth',
            30: 'thirtieth', 40: 'fortieth', 50: 'fiftieth', 60: 'sixtieth', 
            70: 'seventieth', 80: 'eightieth', 90: 'ninetieth', 100: 'hundredth'
        };
        
        // Number conversion function
        const convertNumber = (num) => {
            num = parseInt(num);
            if (num === 0) return 'zero';
            if (num < 0 || num >= 10000) return num.toString();
            
            // Handle numbers less than 100
            const under100 = (n) => {
                if (n <= 20) return numberWords[n];
                const tens = Math.floor(n / 10) * 10;
                const ones = n % 10;
                return ones === 0 ? numberWords[tens] : `${numberWords[tens]} ${numberWords[ones]}`;
            };
            
            // Handle three and four-digit numbers
            if (num < 100) return under100(num);
            if (num < 1000) {
                const hundreds = Math.floor(num / 100);
                const remainder = num % 100;
                return remainder === 0 ? `${numberWords[hundreds]} hundred` : 
                    `${numberWords[hundreds]} hundred ${under100(remainder)}`;
            }
            
            // Handle four-digit numbers
            const thousands = Math.floor(num / 1000);
            const remainder = num % 1000;
            if (remainder === 0) return `${numberWords[thousands]} thousand`;
            
            const hundreds = Math.floor(remainder / 100);
            const tens = remainder % 100;
            
            if (hundreds === 0) return `${numberWords[thousands]} thousand ${under100(tens)}`;
            if (tens === 0) return `${numberWords[thousands]} thousand ${numberWords[hundreds]} hundred`;
            
            return `${numberWords[thousands]} thousand ${numberWords[hundreds]} hundred ${under100(tens)}`;
        };
        
        // Generate ordinal numbers
        const generateOrdinal = (num) => {
            num = parseInt(num);
            if (ordinalWords[num]) return ordinalWords[num];
            
            if (num < 100) {
                const tens = Math.floor(num / 10) * 10;
                const ones = num % 10;
                return ones === 0 ? `${numberWords[tens]}th` : `${numberWords[tens]} ${ordinalWords[ones]}`;
            }
            
            if (num < 1000) {
                const hundreds = Math.floor(num / 100);
                const remainder = num % 100;
                
                if (remainder === 0) return `${numberWords[hundreds]} hundredth`;
                if (ordinalWords[remainder]) return `${numberWords[hundreds]} hundred ${ordinalWords[remainder]}`;
                
                const tens = Math.floor(remainder / 10) * 10;
                const ones = remainder % 10;
                return ones === 0 ? `${numberWords[hundreds]} hundred ${numberWords[tens]}th` : 
                    `${numberWords[hundreds]} hundred ${numberWords[tens]} ${ordinalWords[ones]}`;
            }
            
            const thousands = Math.floor(num / 1000);
            const remainder = num % 1000;
            return remainder === 0 ? `${numberWords[thousands]} thousandth` : 
                `${numberWords[thousands]} thousand ${generateOrdinal(remainder)}`;
        };
        
        // Process various number formats
        const processNumberFormats = (inputText) => {
            const replacements = [
                // Special handling for text like "Waves (Left) 3rd fast"
                [/Waves\s*\([^)]+\)\s*(\d+)(nd|rd|th|st)\s+fast/gi, (match, num) => 
                    match.replace(/\d+(nd|rd|th|st)/, generateOrdinal(parseInt(num)))],
                [/\b(\d+)(nd|rd|th|st)\b/gi, (_, num) => generateOrdinal(parseInt(num))],
                [/\bx(\d+)\b/gi, (_, num) => `times ${convertNumber(parseInt(num))}`],
                [/(\d+)%/g, (_, num) => `${convertNumber(parseInt(num))} percent`],
                [/\b(\d+)\s*-\s*(\d+)\s*-\s*(\d+)\b/g, (_, n1, n2, n3) => 
                    `${convertNumber(n1)} dash ${convertNumber(n2)} dash ${convertNumber(n3)}`],
                [/\b(\d+)x(\d+)\b/g, (_, n1, n2) => `${convertNumber(n1)} times ${convertNumber(n2)}`],
                [/\b(\d+)x\s+([^\s,;:.!?]+(?:\s+[^\s,;:.!?]+)*)/g, (match, num) => 
                    `${convertNumber(parseInt(num))} times ${match.substring(match.indexOf('x ') + 2)}`],
                [/\b(\d+)x([A-Za-z][^\s,;:.!?]*)/g, (_, num, text) => 
                    `${convertNumber(parseInt(num))} times ${text}`],
                [/\b\d+\b/g, match => convertNumber(parseInt(match))]
            ];
            
            return replacements.reduce((text, [pattern, replacer]) => 
                text.replace(pattern, replacer), inputText);
        };
        
        // Process content inside parentheses first, then outside
        text = text.replace(/\(([^)]+)\)/g, (match, content) => 
            `(${processNumberFormats(content)})`
        );
        return processNumberFormats(text);
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
     * Play audio file corresponding to text
     * If exists in cache, play directly; otherwise get from API and play
     * @param {string} text Text to play
     * @param {string} voiceName Voice name
     * @returns {Promise<void>}
     */
    async speak(text, voiceName = this.settings.defaultVoice) {
        try {
            const { processedText, filePath, voiceName: voice } = await this._validateAndPrepare(text, voiceName);
            
            if (fs.existsSync(filePath)) {
                return this.playAudio(filePath);
            } else {
                await this._fetchAudioFromAPI(processedText, voice);
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
        try {
            const { processedText, filePath, voiceName: voice } = await this._validateAndPrepare(text, voiceName);
            
            if (!fs.existsSync(filePath)) {
                await this._fetchAudioFromAPI(processedText, voice);
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
     * @param {Object} settings New settings object
     */
    updateSettings(settings) {
        if (!settings) return;
        
        // Only process allowed parameters
        const userSettings = {};
        ['apiKey', 'voices', 'rate', 'enabled', 'defaultVoice'].forEach(key => {
            if (settings[key] !== undefined) userSettings[key] = settings[key];
        });
        
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
     */
    setVoice(name, id) {
        if (!this.settings.voices) this.settings.voices = {};
        this.settings.voices[name] = id;
        if (Object.keys(this.settings.voices).length === 1) {
            this.settings.defaultVoice = name;
        }
        this._ensureDir(path.join(this._getActualCachePath(), name));
        return { name, id };
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
     * Set API key
     * @param {string} apiKey API key
     */
    setApiKey(apiKey) { 
        this.settings.apiKey = apiKey;
        return apiKey;
    }
    
    /**
     * Set enabled status
     * @param {boolean} enabled Whether enabled
     */
    setEnabled(enabled) { 
        this.settings.enabled = !!enabled;
        return this.settings.enabled;
    }
    
    /**
     * Set default voice
     * @param {string} name Voice name
     * @returns {boolean} Whether successful
     */
    setDefaultVoice(name) { 
        if (!this.settings.voices || !this.settings.voices[name]) {
            return false;
        }
        this.settings.defaultVoice = name;
        return true;
    }
    
    /**
     * Set speech rate
     * @param {number} rate Speech rate value (0.5-5)
     * @returns {number} Actually set rate value
     */
    setRate(rate) { 
        this.settings.rate = Math.max(0.5, Math.min(5, parseFloat(rate) || 1));
        return this.settings.rate;
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