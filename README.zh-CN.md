# tera-guide-core

[English](README.md) | [简体中文](README.zh-CN.md)

基于hsdn的版本增加了在线TTS语音生成功能

### 主要特点

* 通过在线API生成高质量语音提示
* 采用ai模型克隆技术，理论上可以克隆任何你想要的声音
* 优化的音频文件缓存机制，提高播放效率和存储利用率
* 完整的GUI界面控制，支持开启关闭在线tts功能、测试在线tts、音色选择、音色删除、语速选择

### 在线tts音频文件播放机制

在线TTS功能采用了智能缓存机制：
* 第一次进入副本时，不会播放语音提醒，系统会通过在线API接口生成音频文件，将音频文件缓存到本地。
* 下一次再进入相同副本时，系统将使用本地缓存的音频文件进行播放。
* 生成的音频文件会按照语音名称分类，自动缓存到本地的`tts_cache`目录中

### 使用方法

#### 第一步：注册在线TTS平台并获取API密钥
1. 访问注册地址：[https://dev.espai.fun](https://dev.espai.fun?invite_code=4c5bf7b78649494689dbc446e43db7f1)
2. 完成注册后，创建超体后，在左下角找到API Key

#### 第二步：配置API密钥
```
guide onlinetts apikey 你的API密钥
```

#### 第三步：添加语音音色
```
guide onlinetts addvoice Kamisato cosyvoice-v2-espai-353f83ac94d8461a954b86cbd67fc6d8
```
> 示例中使用的是原神游戏角色"神里绫华(Kamisato)"的音色，音色ID为"cosyvoice-v2-espai-353f83ac94d8461a954b86cbd67fc6d8"


### 完整命令列表

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