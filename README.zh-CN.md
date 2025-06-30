# tera-guide-core

[English](README.md) | [简体中文](README.zh-CN.md)

基于hsdn的版本增加了在线TTS语音生成功能

## 在线TTS功能

模块集成了在线TTS语音功能，可以使用高质量的AI语音模型来播放攻略提示。

### 主要特点

* 支持通过在线API生成高质量语音提示
* 免费TTS语音生成平台：https://dev.espai2.fun/
* 支持多种语音模型，理论上可以克隆任何你想要的声音
* 优化的音频文件缓存机制，提高播放效率和存储利用率
* 完整的GUI界面控制

### 使用方法

1. **设置API密钥**：
   ```
   guide onlinetts apikey 你的API密钥
   ```

2. **添加语音**：
   ```
   guide onlinetts addvoice Kamisato cosyvoice-v2-espai-353f83ac94d8461a954b86cbd67fc6d8
   ```
   示范音色是原神游戏中的角色神里绫华"Kamisato"，音色ID是"cosyvoice-v2-espai-353f83ac94d8461a954b86cbd67fc6d8"

3. **设置默认语音**：
   ```
   guide onlinetts voice Kamisato
   ```

4. **测试语音**：
   ```
   guide onlinetts test "这是一条测试消息"
   ```

### 缓存机制

在线TTS功能采用了智能缓存机制：
* 第一次进入副本时，系统会通过在线API生成音频文件并缓存到本地，但这些文件不会立即播放
* 生成的音频文件会按照语音名称分类，自动缓存到本地的`tts_cache`目录中
* 文件名采用智能处理，自动移除标点符号并限制长度，确保文件系统兼容性
* 缓存文件按照语音分目录存储，便于管理和清理
* 下一次再进入相同副本时，系统将直接使用本地缓存的音频文件进行播放，无需再次请求API

### GUI控制

在模块的GUI界面中添加了在线TTS控制选项：
* 启用/禁用在线TTS功能
* 测试在线TTS功能
* 更改默认语音
* 调整语音速率

### 命令列表

* `guide onlinetts` - 启用/禁用在线TTS功能
* `guide onlinetts apikey <密钥>` - 设置API密钥
* `guide onlinetts voice` - 显示当前默认语音和所有可用语音及其ID
* `guide onlinetts voice <语音名称>` - 设置默认语音
* `guide onlinetts addvoice <语音名称> <语音ID>` - 添加/修改语音
* `guide onlinetts deletevoice <语音名称>` - 删除语音
* `guide onlinetts rate <速率值>` - 设置语音速率（范围：0.5-5，默认：1）
* `guide onlinetts test [文本] [语音名称]` - 测试在线TTS功能

## 致谢
- **[Kasea](https://github.com/Kaseaa)** - Tera-Guide和Library模块的原始开发者
- **[michengs](https://github.com/michengs)** - 模块核心初始代码的开发者
- **[Multarix](https://github.com/Multarix)** - 代码中使用的一些想法的作者
- **[justkeepquiet](https://github.com/justkeepquiet)** - 项目维护者 