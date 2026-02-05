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

			})
			.catch(() => {/* continue regardless of error */});
	}

	/**
	 * Configure OnlineTTS
	 */
	__configureOnlineTTS() {
		const settings = this.__mod.settings.onlineTTS || {};
		
		// Merge with onlineTTSConfig from params if available
		const onlineTTSConfig = this.__params.onlineTTSConfig || {};
		const mergedSettings = { ...settings, ...onlineTTSConfig };
		
		if (!this.__onlineTTS) {
			this.__onlineTTS = new OnlineTTS(mergedSettings);
			
			// Ensure selected pack exists if any pack is installed
			if (!settings.selectedPack) {
				const selected = this.__onlineTTS.getSelectedPack();
				if (selected) {
					this.__mod.settings.onlineTTS = {
						...mergedSettings,
						selectedPack: selected
					};
				}
			}
			
		} else {
			this.__onlineTTS.updateSettings(mergedSettings);
		}

		const refreshPromise = this.__onlineTTS.refreshRemotePacks(!!mergedSettings.autoUpdateInstalled);
		if (mergedSettings.autoUpdateInstalled) {
			refreshPromise
				.then(packs => this.__autoUpdateOnlineTTS(packs))
				.catch(() => {/* ignore auto update errors */});
		}
	}

	__autoUpdateOnlineTTS(packs) {
		if (!this.__onlineTTS || !Array.isArray(packs)) return;

		const targets = packs.filter(pack => pack.installed && pack.updateAvailable);
		if (targets.length === 0) return;

		const log = this.__mod.log ? this.__mod.log.bind(this.__mod) : console.log;
		log(`[OnlineTTS] Auto update: ${targets.length} pack(s) found.`);

		(async () => {
			for (const pack of targets) {
				const label = `${pack.lang}/${pack.voice}`;
				log(`[OnlineTTS] Updating ${label}...`);
				let lastPercent = -1;
				const onProgress = (info) => {
					if (!info || !info.total) return;
					const percent = info.percent;
					if (percent === lastPercent) return;
					if (percent % 25 !== 0 && percent !== 100) return;
					lastPercent = percent;
					log(`[OnlineTTS] ${label} ${percent}% (${info.completed}/${info.total})`);
				};
				try {
					await this.__onlineTTS.downloadPack(pack.lang, pack.voice, { force: true, onProgress });
					log(`[OnlineTTS] Updated ${label}.`);
				} catch (err) {
					log(`[OnlineTTS] Update failed ${label}: ${err ? err.message : err}`);
				}
			}
		})().catch(() => {/* ignore */});
	}

	/**
	 * Get OnlineTTS instance
	 * @returns {Object|null} OnlineTTS instance
	 */
	getOnlineTTS() {
		return this.__onlineTTS;
	}

	/**
	 * Update OnlineTTS settings
	 * @param {Object} settings New settings
	 * @returns {Object} Updated settings
	 */
	updateOnlineTTSSettings(settings) {
		if (!this.__onlineTTS) return null;
		
		this.__mod.settings.onlineTTS = {
			...(this.__mod.settings.onlineTTS || {}),
			...settings
		};
		
		return this.__onlineTTS.updateSettings(settings);
	}

	/**
	 * Test OnlineTTS
	 * @param {string} text Test text
	 * @returns {Promise<boolean>} Test result
	 */
	testOnlineTTS(text) {
		if (!this.__onlineTTS) return Promise.resolve(false);
		const pack = this.__onlineTTS.getSelectedPack();
		if (!pack) return Promise.resolve(false);
		return this.__onlineTTS.speak(text, pack.lang, pack.voice)
			.then(() => true)
			.catch(() => false);
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
		
		// Check if using OnlineTTS (cache-only, no API fallback)
		if (this.__onlineTTS && this.__onlineTTS.isEnabled()) {
			const pack = this.__onlineTTS.getSelectedPack();
			if (!pack) return;

			const voiceLang = (pack.lang || "").toLowerCase();

			// If voice language differs from display language
			if (voiceLang && voiceLang !== currentLang) {
				if (key && dungeonId) {
					const i18nManager = this.__mod.i18nManager;
					if (i18nManager) {
						const ttsText = i18nManager.getTranslation(dungeonId, key, voiceLang);
						if (ttsText) {
							this.__onlineTTS.speak(ttsText, pack.lang, pack.voice)
								.catch(() => {/* Silent skip - no fallback */});
							return;
						}
					}
				}
				// Language mismatch and no key - skip
				return;
			}

			// Voice language matches display language
			this.__onlineTTS.speak(text, pack.lang, pack.voice)
				.catch(() => {/* Silent skip - no fallback */});
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
