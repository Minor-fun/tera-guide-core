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
        // Get plugin root directory
        this.rootDir = path.join(__dirname, '..');
        // Configuration file path
        this.configPath = path.join(this.rootDir, 'config_onlineTTS.json');
        
        // Default configuration
        const defaultConfig = {
            "enabled": false,
            "apiKey": "",
            "apiEndpoint": "https://api.espai.fun/ai_api/tts", // Hardcoded API endpoint address
            "voices": {}, // Empty default voices
            "defaultVoice": "",
            "sampleRate": 24000,
            "volume": 90,
            "rate": 1,
            "cacheDir": "tts_cache"
        };
        
        // Load or create configuration file
        this.settings = this._loadConfig(defaultConfig);
        
        // Initialize
        this._init();
    }

    /**
     * Initialize TTS system
     * @private
     */
    _init() {
        // Ensure cache directories exist
        this._ensureCacheDirs();
        
        // Initialize audio player
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
                const configData = fs.readFileSync(this.configPath, 'utf8');
                const config = JSON.parse(configData);
                
                // Use spread operator to simplify object merging
                return { ...defaultConfig, ...config };
            } else {
                // Configuration file doesn't exist, create default configuration
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
            // Save to local configuration file
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
        // Create main cache directory
        const cachePath = this._ensureDir(this._getActualCachePath());
        
        // Create subdirectory for each voice
        Object.keys(this.settings.voices).forEach(voiceName => {
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
        
        // Truncate long text
        if (processedText.length > maxLength) {
            processedText = processedText.substring(0, maxLength);
        }
        
        return processedText || 'tts_audio';
    }

    /**
     * Get cached audio file path
     * @param {string} text Text content
     * @param {string} voiceName Voice name
     * @returns {string} File path
     * @private
     */
    _getCacheFilePath(text, voiceName) {
        const fileName = `${this._textToFileName(text)}.mp3`;
        return path.join(this._getActualCachePath(), voiceName, fileName);
    }

    /**
     * Check if corresponding audio file exists in cache
     * @param {string} text Text content
     * @param {string} voiceName Voice name
     * @returns {boolean} Whether exists
     */
    hasCachedAudio(text, voiceName = this.settings.defaultVoice) {
        const filePath = this._getCacheFilePath(text, voiceName);
        return fs.existsSync(filePath);
    }

    /**
     * Get voice ID
     * @param {string} voiceName Voice name
     * @returns {string} Voice ID
     * @private
     */
    _getVoiceId(voiceName) {
        // If voice is not set or specified voice doesn't exist, return null
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
            // Check parameters
            if (!text || typeof text !== 'string') {
                return reject(new Error('Invalid text parameter'));
            }
            
            // Prepare API request data
            const voiceId = this._getVoiceId(voiceName);
            
            // Check necessary parameters
            if (!this.settings.apiKey || !voiceId) {
                return reject(new Error(
                    !this.settings.apiKey ? 'API key not set' : 'Invalid voice ID, please add a voice first'
                ));
            }
            
            const postData = JSON.stringify({
                text,
                reference_id: voiceId,
                api_key: this.settings.apiKey,
                sample_rate: this.settings.sampleRate,
                volume: this.settings.volume,
                rate: this.settings.rate
            });

            // Parse API endpoint URL
            const url = new URL(this.settings.apiEndpoint);
            
            // Prepare request options
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
            
            // Send request
            const req = https.request(options, (res) => {
                // Check response status code
                if (res.statusCode !== 200) {
                    return reject(new Error(`API request failed, status code: ${res.statusCode}`));
                }

                // Receive audio data
                const dataChunks = [];
                res.on('data', chunk => dataChunks.push(chunk));
                res.on('end', () => {
                    // Merge data chunks and save file
                    const buffer = Buffer.concat(dataChunks);
                    const filePath = this._getCacheFilePath(text, voiceName);
                    
                    try {
                        fs.writeFileSync(filePath, buffer);
                        resolve(filePath);
                    } catch (err) {
                        reject(new Error(`Failed to save audio file: ${err.message}`));
                    }
                });
            });
            
            // Error handling
            req.on('error', err => reject(new Error(`API request failed: ${err.message}`)));
            
            // Timeout handling
            req.setTimeout(10000, () => {
                req.abort();
                reject(new Error('API request timeout'));
            });
            
            // Send request data
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
        // Check if available
        if (!this.isAvailable()) {
            return Promise.reject(new Error(
                !this.settings.enabled ? 'Online TTS not enabled' : 'API key not set, unable to use online TTS service'
            ));
        }
        
        // Check if there are available voices
        if (Object.keys(this.settings.voices).length === 0) {
            return Promise.reject(new Error('No voices set, please add a voice first'));
        }
        
        // If voice not specified and default voice is empty, use first available voice
        if (!voiceName && !this.settings.defaultVoice) {
            voiceName = Object.keys(this.settings.voices)[0];
        }
        
        const filePath = this._getCacheFilePath(text, voiceName);
        
        try {
            if (fs.existsSync(filePath)) {
                // Exists in cache, play directly
                return this.playAudio(filePath);
            } else {
                // Not in cache, get from API
                const audioPath = await this._fetchAudioFromAPI(text, voiceName);
                return this.playAudio(audioPath);
            }
        } catch (err) {
            console.error(`TTS processing failed: ${err.message}`);
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
        // Handle updating entire configuration object
        if (typeof key === 'object') {
            this.settings = { ...this.settings, ...key };
            this._saveConfig();
            
            // If voice settings updated, ensure corresponding cache directories exist
            if (key.voices) {
                this._ensureCacheDirs();
            }
            return this.settings;
        }
        
        // Handle updating single configuration item
        if (typeof key === 'string') {
            let finalValue = value;
            
            // Validate and process based on configuration item
            if (validate) {
                switch(key) {
                    case 'enabled':
                        finalValue = !!value;
                        break;
                    case 'rate':
                        finalValue = Math.max(0.5, Math.min(5, parseFloat(value) || 1));
                        break;
                    case 'volume':
                        finalValue = Math.max(0, Math.min(100, parseInt(value) || 90));
                        break;
                    case 'defaultVoice':
                        if (!this.settings.voices || !this.settings.voices[value]) {
                            return false;
                        }
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
        if (!this.settings.voices) {
            this.settings.voices = {};
        }
        
        this.settings.voices[name] = id;
        
        // If this is the first voice, set as default
        if (Object.keys(this.settings.voices).length === 1) {
            this.settings.defaultVoice = name;
        }
        
        this._saveConfig();
        
        // Create cache directory for new voice
        this._ensureDir(path.join(this._getActualCachePath(), name));
    }

    /**
     * Delete voice
     * @param {string} name Voice name
     * @returns {boolean} Whether deletion was successful
     */
    deleteVoice(name) {
        // Check if voice exists
        if (!this.settings.voices || !this.settings.voices[name]) {
            return false;
        }
        
        // Not allowed to delete current default voice
        if (this.settings.defaultVoice === name) {
            return false;
        }
        
        // Delete voice
        delete this.settings.voices[name];
        
        // Save configuration
        this._saveConfig();
        
        // Try to delete voice cache directory
        try {
            const cachePath = path.join(this._getActualCachePath(), name);
            if (fs.existsSync(cachePath)) {
                // Don't use recursive deletion due to potential security risks
                // Only delete files in directory, preserve directory structure
                const files = fs.readdirSync(cachePath);
                files.forEach(file => {
                    try {
                        fs.unlinkSync(path.join(cachePath, file));
                    } catch (e) {
                        // Ignore file deletion errors
                    }
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
        return this.updateConfig('apiKey', apiKey);
    }
    

    
    /**
     * Set enabled status
     * @param {boolean} enabled Whether enabled
     */
    setEnabled(enabled) {
        return this.updateConfig('enabled', enabled, true);
    }
    
    /**
     * Set default voice
     * @param {string} name Voice name
     * @returns {boolean} Whether successful
     */
    setDefaultVoice(name) {
        return this.updateConfig('defaultVoice', name, true);
    }
    
    /**
     * Set speech rate
     * @param {number} rate Speech rate value (0.5-5)
     * @returns {number} Actually set rate value
     */
    setRate(rate) {
        return this.updateConfig('rate', rate, true);
    }
    

    
    /**
     * Get voice list
     * @returns {Object} Voice list
     */
    getVoices() {
        return { ...this.settings.voices };
    }
    
    /**
     * Get current configuration
     * @returns {Object} Current configuration
     */
    getConfig() {
        return { ...this.settings };
    }

    /**
     * Test API connection
     * @param {string} text Test text
     * @param {string} voiceName Voice name
     * @returns {Promise<boolean>} Test result
     */
    testAPI(text = "This is a test", voiceName = null) {
        // Check if available
        if (!this.isAvailable()) {
            return Promise.resolve(false);
        }
        
        // Use specified voice or default voice
        const testVoice = voiceName || this.settings.defaultVoice;
        
        // Test API connection
        return this.speak(text, testVoice)
            .then(() => true)
            .catch(() => false);
    }
}

module.exports = OnlineTTS; 