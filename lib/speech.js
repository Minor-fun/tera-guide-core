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
		
		if (!this.__onlineTTS) {
			this.__onlineTTS = new OnlineTTS(settings);
		} else {
			this.__onlineTTS.updateSettings(settings);
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
	 * Update online TTS voice based on language
	 * @param {string} lang Language code
	 */
	updateVoiceForLanguage(lang) {
		if (!this.__onlineTTS) return;
		
		const voiceName = this.__onlineTTS.getVoiceForLanguage(lang);
		if (voiceName) {
			// Update module settings and onlineTTS instance
			this.updateOnlineTTSSettings({ defaultVoice: voiceName, enabled: true });
		} else {
			// If no voice found for this language, disable online TTS
			this.updateOnlineTTSSettings({ enabled: false });
		}
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
	 * @param {string} message
	 * @memberof Speech
	 */
	play(message) {
		// Check if using online TTS
		if (this.__onlineTTS && this.__onlineTTS.isAvailable()) {
			// Use online TTS
			this.__onlineTTS.speak(message)
				.catch(err => {
					console.error(`Online TTS playback failed: ${err.message}`);
					this.__playLocalTTS(message);
				});
			return;
		}
		
		// Use local TTS
		this.__playLocalTTS(message);
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