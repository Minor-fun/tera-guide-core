"use strict";

const exec = require("child_process").exec;
const path = require("path");

// Default language
const defaultLanguage = "en";

// Supported languages by client
const languages = {
	"0": "en",
	"1": "kr",
	"3": "jp",
	"4": "de",
	"5": "fr",
	"7": "tw",
	"8": "ru"
};

/**
 * @typedef {import("../index").deps} deps
 */

class Lang {
	/**
	 * Creates an instance of Lang.
	 * @param {deps} deps
	 * @memberof Lang
	 */
	constructor(deps) {
		this.__deps = deps;

		// Degault language
		this.defaultLanguage = defaultLanguage;

		// Client language
		this.language = null;
		this.languageUC = null;

		// System language
		this.systemCulture = null;
		this.systemLanguage = null;

		// Current language strings
		this.strings = {};
	}

	/**
	 * Initialize language params.
	 * @memberof Lang
	 */
	init() {
		// Correct case
		this.__deps.mod.settings.language = this.__deps.mod.settings.language.toLowerCase();

		// Detect and apply language
		this.applyLanguage();

		// Apply translation for strings
		this.applyStrings();

		// Appy names translation for dungeons configuration
		this.applyDungeons();

		// Initialize speech
		this.__deps.speech.init();

		// Set system language
		this.__getSystemCulture((e, data) => {
			if (e) return;

			this.systemCulture = data.trim();
			this.systemLanguage = this.systemCulture.split("-")[0];

			// Re-apply language
			this.applyLanguage();

			// Re-apply translation for strings
			this.applyStrings();

			// Re-appy names translation for dungeons configuration
			this.applyDungeons();

			// Re-initialize speech
			this.__deps.speech.init();
		});
	}

	/**
	 * Apply language from the client, Toolbox or system.
	 * @memberof Lang
	 */
	applyLanguage() {
		// Correct case
		this.__deps.mod.settings.language = this.__deps.mod.settings.language.toLowerCase();

		// Set client language
		if (!this.__deps.mod.settings.language || this.__deps.mod.settings.language == "auto") {
			this.language = languages[this.__deps.mod.game.language] || languages["0"];

			// If the client language is same the defaultLanguage, trying to get language from Toolbox UI
			if (this.language === defaultLanguage) {
				try {
					this.language = require("../../../bin/config").loadConfig()?.uilanguage.split("-")[0];
				} catch (_) {
					this.language = defaultLanguage;
				}
			}

			// If the client language is same the defaultLanguage, using the systemLanguage
			if (this.language === defaultLanguage && this.systemLanguage)
				this.language = this.systemLanguage;
		} else
			this.language = this.__deps.mod.settings.language;

		// Fix IETF tag with TERA language name
		if (this.language === "ko")
			this.language = "kr";

		// Set client language in upper case
		this.languageUC = this.language.toUpperCase();
	}

	/**
	 * Apply translation for strings.
	 * @memberof Lang
	 */
	applyStrings() {
		const localStrings = require("./lang/strings");
		delete require.cache[require.resolve("./lang/strings")];

		// Try to get strings from i18nManager if available
		if (this.__deps.mod.i18nManager && this.__deps.mod.i18nManager.translations["general"]) {
			const general = this.__deps.mod.i18nManager.translations["general"];

			// Merge default language (en)
			if (general[defaultLanguage]) {
				Object.assign(localStrings.general[defaultLanguage], general[defaultLanguage]);
			}

			// Merge current language
			if (general[this.language]) {
				Object.assign(localStrings.general[defaultLanguage], general[this.language]);
			}
		}

		// Set language strings
		this.strings = localStrings.general[defaultLanguage];

		// Reconstruct helpbody from help_structure if available
		try {
			const helpStructure = require("./data/help_structure");
			this.strings.helpbody = helpStructure.map(item => {
				// Use translated string if available, otherwise use English text
				const translatedText = this.strings[item.text] || item.text;
				return [translatedText, item.type];
			});
		} catch (e) {
			// Fallback to existing helpbody if structure not found or error
			if (!this.strings.helpbody) {
				this.strings.helpbody = [];
			}
		}
	}

	/**
	 * Apply translation for dungeons list.
	 * @memberof Lang
	 */
	applyDungeons() {
		const localStrings = require("./lang/dungeons");

		// Apply translation
		Object.keys(this.__deps.mod.settings.dungeons).forEach(zoneId => {
			let name = null;

			// 1. Try i18nManager
			if (this.__deps.mod.i18nManager && this.__deps.mod.i18nManager.translations[zoneId]) {
				const dungeonTrans = this.__deps.mod.i18nManager.translations[zoneId];
				// Try current language
				if (dungeonTrans[this.language] && dungeonTrans[this.language]["@dungeon"]) {
					name = dungeonTrans[this.language]["@dungeon"];
				}
				// Try default language
				else if (dungeonTrans[this.defaultLanguage] && dungeonTrans[this.defaultLanguage]["@dungeon"]) {
					name = dungeonTrans[this.defaultLanguage]["@dungeon"];
				}
			}

			// 2. Try core defaults
			if (!name) {
				if (localStrings[zoneId])
					name = localStrings[zoneId][this.language] || localStrings[zoneId][this.defaultLanguage];
			}

			if (name)
				this.__deps.mod.settings.dungeons[zoneId].name = name;
		});
	}

	/**
	 * Get text message of event.
	 * @param {Object} event Event object
	 * @return {string} Text string
	 * @memberof Lang
	 */
	getEventText(event) {
		return event[`message_${this.languageUC}`] || event[`message_${this.language}`] || event["message"] ||
			event[`text_${this.languageUC}`] || event[`text_${this.language}`] || event["text"];
	}

	/**
	 * Get language properties
	 * @readonly
	 * @memberof Lang
	 */
	get props() {
		return {
			"defaultLanguage": this.defaultLanguage,
			"language": this.language,
			"languageUC": this.languageUC,
			"systemCulture": this.systemCulture,
			"systemLanguage": this.systemLanguage,
			"strings": this.strings
		};
	}

	__getSystemCulture(handler) {
		exec("powershell [CultureInfo]::InstalledUICulture.Name", handler);
	}
}

module.exports = Lang;