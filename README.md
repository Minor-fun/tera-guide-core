# tera-guide-core

[English](README.md) | [简体中文](README.zh-CN.md)

# tera-guide-core

This version adds online TTS voice generation functionality based on hsdn's version.

For guides compatible with this version, you must use this address: https://github.com/Minor-fun/tera-guide

### Main Features of Online TTS

* Generate high-quality voice prompts through online API
* Uses AI model cloning technology, theoretically able to clone any voice you want
* Optimized audio file caching mechanism, improving playback efficiency and storage utilization
* Complete GUI interface control, supporting enabling/disabling online TTS, testing online TTS, voice selection, voice deletion, and speed selection

### Online TTS Audio File Playback Mechanism

The online TTS feature uses an intelligent caching mechanism:
* When entering a dungeon for the first time, voice reminders won't play. The system will generate audio files through the online API interface and cache them locally.
* The next time you enter the same dungeon, the system will use the locally cached audio files for playback.
* Generated audio files are categorized by voice name and automatically cached in the local `tts_cache` directory.

## Basic features

* Complete tools for custom guides creation for your favorite dungeons.
* Support for the features to add your languages translations.
* Built-in GUI support for all guide settings.
* Support for voice notifications (Windows TTS module is used).
* Flexible and powerful functionality for scripting guides.
* Automatically generated dungeon list based on game client files.
* Used modern JavaScript for improved performance.
* To handle all events and hooks used nodejs EventEmitter.

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

If necessary, you can add your own translation of the commands, GUI and dungeon list. To do this, create a **lang** folder into root directory of your module, add there files [strings.js](https://raw.githubusercontent.com/hsdn/tera-guide-core/master/lib/lang/strings.js) and [dungeons.js](https://raw.githubusercontent.com/hsdn/tera-guide-core/master/lib/lang/dungeons.js), and edit them to include your translation. It is recommended to use ISO code to specify the language in the string arrays.

At next edit your **settings_migrator.js** by changing the `language` parameter to specify your language code (the code must match the one specified in the guide files and files above). To specify the your language for message strings in guide files, please use the keys in format `message_LANG` (where `LANG` is the ISO code of your language), for example: `message_RU`.

## Available guides

Based on this module, many guides have already been created for all dungeons.   
The guide script files are available here: https://github.com/hsdn/tera-guide-archive/

## Credits
- **[Kasea](https://github.com/Kaseaa)** - Original developer of Tera-Guide and Library modules
- **[michengs](https://github.com/michengs)** - Developer of initial code of the module core
- **[Multarix](https://github.com/Multarix)** - Author of some ideas that were used in the code
- **[justkeepquiet](https://github.com/justkeepquiet)** - Project maintainer