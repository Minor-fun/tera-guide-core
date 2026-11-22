# tera-guide-core

[English](README.md) | [简体中文](README.zh-CN.md)

## Dependencies

* **Library** - https://github.com/tera-private-toolbox/library

When using TeraToolbox, all dependencies will be installed automatically.

## Manual Installation

Extract to **mods** directory in your TeraToolbox.   
Make sure it's named **tera-guide-core** not "tera-guide-core-master".

_Распаковать в директорию **mods** в ваш TeraToolbox.   
Директория должна называться **tera-guide-core**, а не "tera-guide-core-master"._

## How to make your own guide

1. Create new module for TeraToolbox (_index.js_, _module.json_, _manifest.json_, _settings\_migrator.js_).
2. Add necessary code (is given below) to the **index.js** and **module.json**.
3. Create a folder called **guides** into root directory of your module.
4. Create your own guide script files and place it into **guides** folder.

Detailed information of guides creating is available here: https://github.com/hsdn/tera-guide-core/wiki

#### Example of `index.js` file
```js
"use strict";

module.exports.NetworkMod = function (mod) {
	try {
		mod.require["tera-guide-core"].load(mod, {
			languages: ["en"], // supported languages
			colors: { gui: {}, general: {} }, // you can change the color settings here
			command: ["guide"], // set your module command(s) name
			chat_name: "Guide", // set chat author name for notices
		});
	} catch (e) {
		mod.error("Warning!\nDepended module \"tera-guide-core\" is needed, but not installed!");
		throw e;
	}
};
```

#### Example of `module.json` file
Note: The dependencies section cannot be changed.
```json
{
    "disableAutoUpdate": false,
    "name": "dungeon-guide",
    "options": {
        "cliName": "Guide",
        "guiName": "Dungeon-Guide",
        "settingsFile": "config.json",
        "settingsMigrator": "settings_migrator.js",
        "settingsVersion": 1.01
    },
    "author": "Example",
    "description": "The dungeon guide module with TTS notifications.",
    "servers": ["https://raw.githubusercontent.com/__YOUR_REPOSITORY_HERE__/master/"],
    "dependencies": {
        "library": "https://raw.githubusercontent.com/tera-private-toolbox/library/master/module.json",
        "tera-guide-core": "https://raw.githubusercontent.com/hsdn/tera-guide-core/master/module.json"
    }
}
```

#### The settings migrator script available here: https://github.com/hsdn/tera-guide-core/wiki/Settings-migrator-script

## Custom translation

Supply `mod.i18nManager` before calling `load(mod, options)`. The current [tera-guide translation manager](https://github.com/Minor-fun/tera-guide/blob/dev/lib/i18n-manager.js) loads JSON files from `i18n/general/<lang>.json` for commands and GUI, and `i18n/<dungeonId>/<lang>.json` for dungeon text. Use `@dungeon` for the translated dungeon name, and pass `i18nManager.getSupportedLanguages()` as `options.languages`.

Guide functions receive the translator `t` as their fifth argument. Use `t("English original text")` to retain the original key for cross-language cached speech.

At next edit your **settings_migrator.js** by changing the `language` parameter to specify your language code (the code must match the one specified in the guide files and files above). To specify the your language for message strings in guide files, please use the keys in format `message_LANG` (where `LANG` is the ISO code of your language), for example: `message_RU`.

## Available guides

Based on this module, many guides have already been created for all dungeons.   
The guide script files are available here: https://github.com/hsdn/tera-guide-archive/

## Credits
- **[Kasea](https://github.com/Kaseaa)** - Original developer of Tera-Guide and Library modules
- **[michengs](https://github.com/michengs)** - Developer of initial code of the module core
- **[Multarix](https://github.com/Multarix)** - Author of some ideas that were used in the code
- **[justkeepquiet](https://github.com/justkeepquiet)** - Project maintainer
