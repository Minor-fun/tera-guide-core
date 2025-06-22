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

		// Selected voices settings
		this.selectedVoices = {};

		// List of installed voices
		this.installedVoices = [];

		// Migrate settings (compat)
		this.__migrateSettings();
	}

	/**
	 * Initialize speech params.
	 * @memberof Speech
	 */
	init() {
		this.selectedVoices = { "male": false, "female": false };

		// Configure online TTS
		this.__configureOnlineTTS();

		// Set speech voices
		this.__voice.init()
			.then(() => this.__voice.getVoices())
			.then(voices => {
				if (this.__lang.language === this.__lang.systemLanguage)
					voices.forEach(val => {
						// If the game language is the same as system language, set the voices of system culture
						if (val.culture === this.__lang.systemCulture)
							return this.selectedVoices[val.gender.toLowerCase()] = val.name;
					});
				else
					voices.forEach(val => {
						// Otherwise, set any voice that matches the game language
						if (val.lang === this.__lang.language)
							return this.selectedVoices[val.gender.toLowerCase()] = val.name;
					});

				// Set list of installed voices
				this.installedVoices = voices;
			})
			.catch(() => {
				// continue regardless of error
			});
	}

	/**
	 * Configure online TTS
	 */
	__configureOnlineTTS() {
		// Initialize online TTS instance
		if (!this.__onlineTTS) {
			this.__onlineTTS = new OnlineTTS();
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
	 * Test online TTS
	 * @param {string} text Test text
	 * @param {string} voiceName Voice name
	 * @returns {Promise<boolean>} Test result
	 */
	testOnlineTTS(text, voiceName) {
		if (!this.__onlineTTS) return Promise.resolve(false);
		
		return this.__onlineTTS.testAPI(text, voiceName);
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
						// Don't fall back to local TTS
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
		// Select params
		const rate = Math.min(this.__mod.settings.speech.rate || 1, 10);
		const volume = Math.min(this.__mod.settings.speech.volume || 100, 100);
		const gender = (this.__mod.settings.speech.gender || defaultGender).toLowerCase();

		// Select the voice
		let voice = this.selectedVoices[gender];

		// Check available genders
		if (!voice && gender === "male") voice = this.selectedVoices.female;
		if (!voice && gender === "female") voice = this.selectedVoices.male;

		// Speak the message
		this.__voice.init()
			.then(() => this.__voice.speak(message, rate, voice, volume))
			.catch(() => {
				// continue regardless of error
			});
	}

	/**
	 * Stop speech.
	 * @memberof Speech
	 */
	stop() {
		// Stop online TTS
		if (this.__onlineTTS) {
			this.__onlineTTS.stop();
		}
		
		// Stop local TTS
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
	}

	destructor() {
		this.stop();
	}
}

module.exports = Speech;