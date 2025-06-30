# tera-guide-core

[English](README.md) | [简体中文](README.zh-CN.md)

Based on hsdn's version with added online TTS voice generation functionality

## Online TTS Feature

The module integrates online TTS voice functionality, allowing you to use high-quality AI voice models for guide notifications.

### Key Features

* High-quality voice notifications through online API
* AI model cloning technology, theoretically capable of cloning any voice you want
* Optimized audio file caching mechanism for improved playback efficiency and storage utilization
* Complete GUI interface control, supporting enable/disable online TTS, test online TTS, voice selection, voice deletion, and speech rate adjustment

### Online TTS Audio File Playback Mechanism

The online TTS feature employs a smart caching system:
* When entering a dungeon for the first time, voice alerts won't play. Instead, the system generates audio files through the online API and caches them locally.
* The next time you enter the same dungeon, the system will use the locally cached audio files for playback.
* Generated audio files are categorized by voice name and automatically cached in the local `tts_cache` directory.

### Usage

#### Step 1: Register on the Online TTS Platform and Get API Key
1. Visit registration address: [https://dev.espai.fun](https://dev.espai.fun?invite_code=4c5bf7b78649494689dbc446e43db7f1)
2. After registration and creating a metabody, find the API Key in the lower left corner

#### Step 2: Configure API Key
```
guide onlinetts apikey YOUR_API_KEY
```

#### Step 3: Add Voice
```
guide onlinetts addvoice Kamisato cosyvoice-v2-espai-353f83ac94d8461a954b86cbd67fc6d8
```
> The sample uses the voice of Genshin Impact character "Kamisato Ayaka", with voice ID "cosyvoice-v2-espai-353f83ac94d8461a954b86cbd67fc6d8"

### Command List

* `guide onlinetts` - Enable/Disable online TTS feature
* `guide onlinetts apikey <key>` - Set API key
* `guide onlinetts voice` - Show current default voice and all available voices with their IDs
* `guide onlinetts voice <voice name>` - Set default voice
* `guide onlinetts addvoice <voice name> <voice ID>` - Add/modify voice
* `guide onlinetts deletevoice <voice name>` - Delete voice
* `guide onlinetts rate <rate value>` - Set speech rate (range: 0.5-5, default: 1)
* `guide onlinetts test [text] [voice name]` - Test online TTS feature

## Credits
- **[Kasea](https://github.com/Kaseaa)** - Original developer of Tera-Guide and Library modules
- **[michengs](https://github.com/michengs)** - Developer of initial code of the module core
- **[Multarix](https://github.com/Multarix)** - Author of some ideas that were used in the code
- **[justkeepquiet](https://github.com/justkeepquiet)** - Maintainer of the project