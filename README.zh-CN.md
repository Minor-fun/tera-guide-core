# tera-guide-core

[English](README.md) | [简体中文](README.zh-CN.md)

# tera-guide-core

基于hsdn的版本增加了GitHub缓存语音播放功能（OnlineTTS）

适配这个版本的guide你必须使用这个地址的：https://github.com/Minor-fun/tera-guide

### OnlineTTS缓存主要特点

* 从公开GitHub缓存仓库播放预生成语音（无需API Key）
* 语音包按「语言 + 音色」组织
* GUI支持开启/关闭缓存、刷新列表、下载/更新/选择/删除语音包
* 本地缓存存放在`tts_cache`目录

### OnlineTTS缓存播放机制

OnlineTTS缓存采用仅缓存播放机制：
* 只播放已下载语音包中的音频
* 语音包或文件缺失时直接跳过
* 远程清单有变化时可刷新并更新


## 基本功能

* 提供完整工具集，用于创建自定义副本、Boss和机制指南
* 支持添加自定义语言翻译
* 内置GUI支持所有指南设置
* 支持语音通知（使用Windows TTS模块）
* 灵活强大的指南脚本编写功能
* 基于游戏客户端文件自动生成副本列表
* 使用现代JavaScript提高性能
* 使用nodejs EventEmitter处理所有事件和钩子

## 依赖

* **Library** - https://github.com/tera-private-toolbox/library

使用TeraToolbox时，所有依赖项将自动安装。

## 手动安装

解压到TeraToolbox的**mods**目录中。  
确保文件夹名称为**tera-guide-core**而不是"tera-guide-core-master"。

## 如何创建自己的指南

1. 为TeraToolbox创建新模块（_index.js_、_module.json_、_manifest.json_、_settings\_migrator.js_）
2. 在**index.js**和**module.json**中添加必要的代码（如下所示）
3. 在模块的根目录下创建名为**guides**的文件夹
4. 创建您自己的指南脚本文件并将其放入**guides**文件夹中

创建指南的详细信息可在此处获取：https://github.com/hsdn/tera-guide-core/wiki

#### `index.js`文件示例
```js
"use strict";

module.exports.NetworkMod = function (mod) {
	try {
		mod.require["tera-guide-core"].load(mod, {
			languages: ["en"], // 支持的语言
			colors: { gui: {}, general: {} }, // 您可以在此处更改颜色设置
			command: ["guide"], // 设置您的模块命令名称
			chat_name: "Guide", // 设置通知的聊天作者名称
		});
	} catch (e) {
		mod.error("Warning!\nDepended module \"tera-guide-core\" is needed, but not installed!");
		throw e;
	}
};
```

#### `module.json`文件示例
注意：依赖项部分不能更改。
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

#### 设置迁移脚本可在此处获取：https://github.com/hsdn/tera-guide-core/wiki/Settings-migrator-script

## 自定义翻译

如有必要，您可以添加自己的命令、GUI和副本列表翻译。为此，请在模块的根目录中创建**lang**文件夹，添加[strings.js](https://raw.githubusercontent.com/hsdn/tera-guide-core/master/lib/lang/strings.js)和[dungeons.js](https://raw.githubusercontent.com/hsdn/tera-guide-core/master/lib/lang/dungeons.js)文件，并编辑它们以包含您的翻译。建议使用ISO代码在字符串数组中指定语言。

接下来，通过更改`language`参数来编辑您的**settings_migrator.js**，以指定您的语言代码（该代码必须与指南文件和上述文件中指定的代码匹配）。要在指南文件中为消息字符串指定您的语言，请使用格式为`message_LANG`的键（其中`LANG`是您语言的ISO代码），例如：`message_RU`。

## 可用指南

基于此模块，已为所有副本创建了许多指南。  
指南脚本文件可在此处获取：https://github.com/hsdn/tera-guide-archive/

## 致谢
- **[Kasea](https://github.com/Kaseaa)** - Tera-Guide和Library模块的原始开发者
- **[michengs](https://github.com/michengs)** - 模块核心初始代码的开发者
- **[Multarix](https://github.com/Multarix)** - 代码中使用的一些想法的作者
- **[justkeepquiet](https://github.com/justkeepquiet)** - 项目维护者 
