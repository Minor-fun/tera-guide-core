# tera-guide-core

[English](README.md) | [简体中文](README.zh-CN.md)

Based on hsdn's version with added online TTS voice generation functionality

## Online TTS Feature

The module integrates online TTS voice functionality, allowing you to use high-quality AI voice models for guide notifications.

### Key Features

* Support for high-quality voice notifications through online API
* Free TTS voice generation platform: https://dev.espai2.fun/
* Support for various voice models, theoretically capable of cloning any voice you want
* Optimized audio file caching mechanism for improved playback efficiency and storage utilization
* Complete GUI interface control

### Usage

1. **Set API Key**:
   ```
   guide onlinetts apikey YOUR_API_KEY
   ```

2. **Add Voice**:
   ```
   guide onlinetts addvoice Kamisato cosyvoice-v2-espai-353f83ac94d8461a954b86cbd67fc6d8
   ```
   The sample voice is "Kamisato" from Genshin Impact game character Kamisato Ayaka, with voice ID "cosyvoice-v2-espai-353f83ac94d8461a954b86cbd67fc6d8"

3. **Set Default Voice**:
   ```
   guide onlinetts voice Kamisato
   ```

4. **Test Voice**:
   ```
   guide onlinetts test "This is a test message"
   ```

### Caching Mechanism

The online TTS feature employs a smart caching system:
* When entering a dungeon for the first time, the system generates audio files through the online API and caches them locally, but these files won't play immediately
* Generated audio files are categorized by voice name and automatically cached in the local `tts_cache` directory
* Filenames are intelligently processed, with punctuation removed and length limited to ensure file system compatibility
* Cache files are stored in directories by voice name for easy management and cleanup
* The next time you enter the same dungeon, the system will directly use the locally cached audio files for playback, without needing to request the API again

### GUI Control

Online TTS control options have been added to the module's GUI interface:
* Enable/Disable online TTS feature
* Test online TTS feature
* Change default voice
* Adjust voice rate

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