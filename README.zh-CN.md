# tera-guide-core

[English](README.md) | [简体中文](README.zh-CN.md)

用于创建自己的副本、BOSS和机制攻略的功能模块。通过这套功能，你可以用任何语言创建自己的攻略，只需编写简单的脚本并在你的index.js中引入**tera-guide-core**模块即可。

基于此模块的攻略可以在这里找到：https://github.com/hsdn/tera-guide

## 基本功能

* 为你喜爱的副本创建自定义攻略的完整工具。
* 支持添加多语言翻译功能。
* 内置GUI支持所有攻略设置。
* 支持语音通知（使用Windows TTS模块）。
* 支持在线TTS语音通知（使用在线API服务）。
* 灵活强大的攻略脚本编写功能。
* 基于游戏客户端文件自动生成副本列表。
* 使用现代JavaScript提高性能。
* 使用nodejs EventEmitter处理所有事件和钩子。

## 依赖

* **Library** - https://github.com/tera-private-toolbox/library

使用TeraToolbox时，所有依赖将自动安装。

## 手动安装

解压到TeraToolbox的**mods**目录中。  
确保文件夹名称为**tera-guide-core**而不是"tera-guide-core-master"。

## 如何创建自己的攻略

1. 为TeraToolbox创建新模块（_index.js_、_module.json_、_manifest.json_、_settings\_migrator.js_）。
2. 将必要的代码（如下所示）添加到**index.js**和**module.json**中。
3. 在模块的根目录中创建名为**guides**的文件夹。
4. 创建自己的攻略脚本文件并放入**guides**文件夹中。

创建攻略的详细信息可在此处获取：https://github.com/hsdn/tera-guide-core/wiki

#### `index.js`文件示例
```js
"use strict";

module.exports.NetworkMod = function (mod) {
	try {
		mod.require["tera-guide-core"].load(mod, {
			languages: ["en"], // 支持的语言
			colors: { gui: {}, general: {} }, // 你可以在这里更改颜色设置
			command: ["guide"], // 设置模块命令名称
			chat_name: "Guide", // 设置通知的聊天作者名称
		});
	} catch (e) {
		mod.error("警告！\n依赖模块\"tera-guide-core\"是必需的，但未安装！");
		throw e;
	}
};
```

#### `module.json`文件示例
注意：依赖部分不能更改。
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
    "description": "带有TTS通知的副本攻略模块。",
    "servers": ["https://raw.githubusercontent.com/__YOUR_REPOSITORY_HERE__/master/"],
    "dependencies": {
        "library": "https://raw.githubusercontent.com/tera-private-toolbox/library/master/module.json",
        "tera-guide-core": "https://raw.githubusercontent.com/hsdn/tera-guide-core/master/module.json"
    }
}
```

#### 设置迁移脚本可在此处获取：https://github.com/hsdn/tera-guide-core/wiki/Settings-migrator-script

## 在线TTS功能

模块现已集成在线TTS语音功能，可以使用高质量的AI语音模型来播放攻略提示。

### 主要特点

* 支持通过在线API生成高质量语音提示
* 免费TTS语音生成平台：https://dev.espai2.fun/
* 支持多种语音模型，理论上可以克隆任何你想要的声音
* 音频文件缓存机制，提高播放效率
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
* 第一次播放语音提示时，需要通过在线API生成音频文件，可能会有延迟
* 生成的音频文件会自动缓存到本地的`tts_cache`目录中
* 后续再次播放相同内容时，将直接使用本地缓存的音频文件，播放速度会正常

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

## 自定义翻译

如有必要，你可以添加自己的命令、GUI和副本列表翻译。为此，在模块的根目录中创建**lang**文件夹，添加[strings.js](https://raw.githubusercontent.com/hsdn/tera-guide-core/master/lib/lang/strings.js)和[dungeons.js](https://raw.githubusercontent.com/hsdn/tera-guide-core/master/lib/lang/dungeons.js)文件，并编辑它们以包含你的翻译。建议使用ISO代码在字符串数组中指定语言。

接下来，通过更改`language`参数来编辑你的**settings_migrator.js**，以指定你的语言代码（代码必须与攻略文件和上述文件中指定的代码匹配）。要在攻略文件中指定你的语言的消息字符串，请使用格式为`message_LANG`的键（其中`LANG`是你的语言的ISO代码），例如：`message_RU`。

## 可用攻略

基于此模块，已经为所有副本创建了许多攻略。  
攻略脚本文件可在此处获取：https://github.com/hsdn/tera-guide-archive/

## 致谢
- **[Kasea](https://github.com/Kaseaa)** - Tera-Guide和Library模块的原始开发者
- **[michengs](https://github.com/michengs)** - 模块核心初始代码的开发者
- **[Multarix](https://github.com/Multarix)** - 代码中使用的一些想法的作者
- **[justkeepquiet](https://github.com/justkeepquiet)** - 项目维护者 