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
		this.__migrateSettings();
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
		const onlineTTSSettings = {};
		
		// Only extract necessary parameters
		['apiKey', 'voices', 'rate', 'enabled', 'defaultVoice'].forEach(key => {
			if (settings[key] !== undefined) onlineTTSSettings[key] = settings[key];
		});
		
		if (!this.__onlineTTS) {
			this.__onlineTTS = new OnlineTTS(onlineTTSSettings);
		} else {
			this.__onlineTTS.updateSettings(onlineTTSSettings);
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
	 * @param {string} message
	 * @memberof Speech
	 */
	play(message) {
		// Check if using online TTS
		if (this.__onlineTTS) {
			const config = this.__onlineTTS.getConfig();
			if (config.enabled && config.apiKey) {
				// Use online TTS
				this.__onlineTTS.speak(message)
					.catch(err => {
						console.error(`Online TTS playback failed: ${err.message}`);
						this.__playLocalTTS(message);
					});
				return;
			}
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

	__migrateSettings() {
		if (!this.__mod.settings.speech) {
			this.__mod.settings.speech = {
				"enabled": this.__mod.settings.speaks || true,
				"rate": parseInt(this.__mod.settings.rate || 1),
				"volume": 100,
				"gender": defaultGender
			};

			delete this.__mod.settings.speaks;
			delete this.__mod.settings.rate;
		}
		
		if (!this.__mod.settings.onlineTTS) {
			this.__mod.settings.onlineTTS = {
				"enabled": false,
				"apiKey": "",
				"voices": {},
				"defaultVoice": "",
				"rate": 1
			};
		}
	}

	destructor() {
		this.stop();
	}
}

module.exports = Speech;