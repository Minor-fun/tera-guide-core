"use strict";

const DefaultSettings = {
    "enabled": false,
    "apiKey": "",
    "apiEndpoint": "https://api.espai.fun/ai_api/tts",
    "voices": {
    },
    "defaultVoice": "",
    "sampleRate": 24000,
    "volume": 90,
    "rate": 1,
    "cacheDir": "tts_cache"
};

module.exports = function MigrateSettings(from_ver, to_ver, settings) {
    if (from_ver === undefined) return { ...DefaultSettings, ...settings };
    else if (from_ver === null) return DefaultSettings;
    else {
        from_ver = Number(from_ver);
        to_ver = Number(to_ver);

        if (from_ver + 0.01 < to_ver) {
            settings = MigrateSettings(from_ver, from_ver + 0.01, settings);
            return MigrateSettings(from_ver + 0.01, to_ver, settings);
        }

        const oldsettings = settings;
        settings = Object.assign(DefaultSettings, {});

        to_ver = Math.round(to_ver * 100) / 100;

        switch (to_ver) {
            case 1.0:
                // 初始版本，无需迁移
                break;
            
            case 1.1:
                // 如果将来有配置变更，可以在这里添加迁移逻辑
                break;
        }

        // 保留用户已有的设置
        for (const option in oldsettings) {
            if (settings[option] !== undefined)
                settings[option] = oldsettings[option];
        }

        return settings;
    }
}; 