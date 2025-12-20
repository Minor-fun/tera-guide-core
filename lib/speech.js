"use strict";

const Voice = require("./voice");
const OnlineTTS = require('./onlineTTS');

// Default voice gender
const defaultGender = "female";

/**
 * @typedef {import("../index").deps} deps
 */

class Speech {
	/**
	 * Creates an instance of Speech.
	 * @param {deps} deps
	 * @memberof Speech
	 */
	constructor(deps) {
		this.__mod = deps.mod;
		this.__lang = deps.lang;
		this.__params = deps.params;
		this.__voice = new Voice();
		this.__onlineTTS = null;
		this.selectedVoices = {};
		this.installedVoices = [];
	}

	/**
	 * Initialize speech params.
	 * @memberof Speech
	 */
	init() {
		this.selectedVoices = { "male": false, "female": false };
		this.__configureOnlineTTS();

		// Set speech voices
		this.__voice.init()
			.then(() => this.__voice.getVoices())
			.then(voices => {
				if (this.__lang.language === this.__lang.systemLanguage)
					voices.forEach(val => {
						// If the game language is the same as system language, set the voices of system culture
						if (val.culture === this.__lang.systemCulture)
							this.selectedVoices[val.gender.toLowerCase()] = val.name;
					});
				else
					voices.forEach(val => {
						// Otherwise, set any voice that matches the game language
						if (val.lang === this.__lang.language)
							this.selectedVoices[val.gender.toLowerCase()] = val.name;
					});

				this.installedVoices = voices;
			})
			.catch(() => {/* continue regardless of error */});
	}

	/**
	 * Configure online TTS
	 */
	__configureOnlineTTS() {
		const settings = this.__mod.settings.onlineTTS || {};
		
		// Merge with ttsConfig from params if available
		const ttsConfig = this.__params.ttsConfig || {};
		const mergedSettings = { ...settings, ...ttsConfig };
		
		if (!this.__onlineTTS) {
			this.__onlineTTS = new OnlineTTS(mergedSettings);
			
			// Sync auto-detected voices back to mod settings
			// This merges new cached voices with existing user config
			const detectedConfig = this.__onlineTTS.getConfig();
			if (detectedConfig.voices && Object.keys(detectedConfig.voices).length > 0) {
				const currentVoices = settings.voices || {};
				const mergedVoices = { ...detectedConfig.voices };
				
				// Preserve user-configured voice IDs (override detected ones)
				for (const [name, config] of Object.entries(currentVoices)) {
					mergedVoices[name] = config;
				}
				
				this.__mod.settings.onlineTTS = {
					...this.__mod.settings.onlineTTS,
					voices: mergedVoices,
					defaultVoice: detectedConfig.defaultVoice || settings.defaultVoice
				};
			}
		} else {
			this.__onlineTTS.updateSettings(mergedSettings);
		}
	}

	/**
	 * Get online TTS instance
	 * @returns {Object|null} Online TTS instance
	 */
	getOnlineTTS() {
		return this.__onlineTTS;
	}

	/**
	 * Update online TTS settings
	 * @param {Object} settings New settings
	 * @returns {Object} Updated settings
	 */
	updateOnlineTTSSettings(settings) {
		if (!this.__onlineTTS) return null;
		
		// Update module settings and onlineTTS instance
		this.__mod.settings.onlineTTS = { 
			...(this.__mod.settings.onlineTTS || {}), 
			...settings 
		};
		
		return this.__onlineTTS.updateSettings(settings);
	}

	/**
	 * Test online TTS
	 * @param {string} text Test text
	 * @param {string} voiceName Voice name
	 * @returns {Promise<boolean>} Test result
	 */
	testOnlineTTS(text, voiceName) {
		return this.__onlineTTS ? this.__onlineTTS.testAPI(text, voiceName) : Promise.resolve(false);
	}

	/**
	 * Play speech.
	 * @param {string} text - Text to speak (displayed text in current language)
	 * @param {string} lang - Language code (optional - defaults to current language)
	 * @param {string} key - Original English key for cross-language TTS lookup (optional, null for parameterized text)
	 * @param {string} dungeonId - Dungeon ID for cross-language TTS lookup (optional)
	 * @memberof Speech
	 */
	play(text, lang = null, key = null, dungeonId = null) {
		if (!text) return;
		
		// Normalize language to lowercase for consistent comparison
		const currentLang = (lang || this.__lang.language || '').toLowerCase();
		
		// Check if using online TTS (enabled, even without API key for cached audio)
		if (this.__onlineTTS && this.__onlineTTS.isEnabled()) {
			const config = this.__onlineTTS.getConfig();
			const defaultVoice = config.defaultVoice;
			const voiceConfig = config.voices[defaultVoice];
			
			// Get the language of the user-selected voice
			const voiceLang = (typeof voiceConfig === 'object' && voiceConfig.lang) 
				? voiceConfig.lang.toLowerCase() 
				: null;
			
			// If voice language differs from display language
			if (voiceLang && voiceLang !== currentLang) {
				// Has key - can do cross-language lookup
				if (key && dungeonId) {
					const i18nManager = this.__mod.i18nManager;
					if (i18nManager) {
						const ttsText = i18nManager.getTranslation(dungeonId, key, voiceLang);
						if (ttsText) {
							// Use the voice language's text with the selected voice
							// Silent skip if no cache - don't fallback to system TTS
							this.__onlineTTS.speak(ttsText, voiceLang, defaultVoice)
								.catch(() => {/* Silent skip - no fallback to system TTS */});
							return;
						}
					}
				}
				// No key (parameterized text) and language mismatch - skip to avoid confusion
				// e.g., don't use Japanese voice to read Chinese text with player names
				return;
			}
			
			// Voice language matches display language - use current text
			// Silent skip if no cache - don't fallback to system TTS
			this.__onlineTTS.speak(text, voiceLang || currentLang, defaultVoice)
				.catch(() => {/* Silent skip - no fallback to system TTS */});
			return;
		}
		
		// Use local TTS
		this.__playLocalTTS(text);
	}

	/**
	 * Use local TTS for playback
	 * @param {string} message Message content
	 * @private
	 */
	__playLocalTTS(message) {
		const settings = this.__mod.settings.speech;
		const rate = Math.min(settings.rate || 1, 10);
		const volume = Math.min(settings.volume || 100, 100);
		const gender = (settings.gender || defaultGender).toLowerCase();

		// Select the voice
		let voice = this.selectedVoices[gender] || this.selectedVoices[gender === "male" ? "female" : "male"];

		// Speak the message
		this.__voice.init()
			.then(() => this.__voice.speak(message, rate, voice, volume))
			.catch(() => {/* continue regardless of error */});
	}

	/**
	 * Stop speech.
	 * @memberof Speech
	 */
	stop() {
		if (this.__onlineTTS) this.__onlineTTS.stop();
		this.__voice.stop();
	}

	destructor() {
		this.stop();
	}
}

module.exports = Speech;