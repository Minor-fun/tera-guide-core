"use strict";

const path = require('path');
const EventEmitter = require('events');
const fs = require('fs');
const { execSync, spawn } = require('child_process');

class AudioPlayer extends EventEmitter {
    constructor() {
        super();
        this.currentPlayback = null;
        this.queue = [];
        this.isPlaying = false;
        // WMP 路径
        this.wmpPath = 'C:\\Program Files\\Windows Media Player\\wmplayer.exe';
        // 检查 WMP 是否存在
        if (!fs.existsSync(this.wmpPath)) {
            this.wmpPath = 'C:\\Program Files (x86)\\Windows Media Player\\wmplayer.exe';
            if (!fs.existsSync(this.wmpPath)) {
                console.warn('找不到 Windows Media Player，将使用默认命令');
                this.wmpPath = 'wmplayer.exe';
            }
        }
    }

    /**
     * Play audio file
     * @param {string} filePath Audio file path
     * @param {Object} options Playback options
     * @param {number} options.volume Volume (0-100)
     * @returns {Promise<void>}
     */
    play(filePath, options = {}) {
        return new Promise((resolve, reject) => {
            try {
                // Check if file exists
                if (!fs.existsSync(filePath)) {
                    return reject(new Error(`音频文件不存在: ${filePath}`));
                }
                
                // 使用绝对路径
                const absolutePath = path.resolve(filePath);
                
                // Play audio using Windows Media Player
                this.isPlaying = true;
                this.emit('play', { filePath: filePath });
                
                // 使用更可靠的方式播放音频
                // 1. 创建临时VBS脚本来播放音频并自动关闭
                const tempScriptPath = path.join(require('os').tmpdir(), `play_audio_${Date.now()}.vbs`);
                const vbsContent = `
                Set Sound = CreateObject("WMPlayer.OCX.7")
                Sound.URL = "${absolutePath.replace(/\\/g, "\\\\")}"
                Sound.Controls.play
                do while Sound.currentmedia.duration = 0
                    wscript.sleep 100
                loop
                wscript.sleep (int(Sound.currentmedia.duration) + 0.5) * 1000
                Sound.close
                `;
                
                fs.writeFileSync(tempScriptPath, vbsContent);
                
                // 使用 spawn 运行 VBS 脚本
                this.currentPlayback = spawn('cscript.exe', ['/nologo', tempScriptPath], { 
                    windowsHide: true,
                    stdio: 'ignore',
                    detached: false
                });
                
                this.currentPlayback.on('close', (code) => {
                    // 删除临时脚本
                    try {
                        fs.unlinkSync(tempScriptPath);
                    } catch (e) {
                        // 忽略删除失败
                    }
                    
                    this.isPlaying = false;
                    this.currentPlayback = null;
                    this.emit('end', { filePath });
                    resolve();
                });
                
                this.currentPlayback.on('error', (err) => {
                    // 删除临时脚本
                    try {
                        fs.unlinkSync(tempScriptPath);
                    } catch (e) {
                        // 忽略删除失败
                    }
                    
                    this.isPlaying = false;
                    this.emit('error', { error: err, filePath });
                    reject(err);
                });
            } catch (err) {
                this.isPlaying = false;
                this.emit('error', { error: err, filePath });
                reject(err);
            }
        });
    }

    /**
     * Add audio to queue and play
     * @param {string} filePath Audio file path
     * @param {Object} options Playback options
     * @returns {Promise<void>}
     */
    async queueAndPlay(filePath, options = {}) {
        // Add to queue
        this.queue.push({ filePath, options });
        
        // If not currently playing, start playing the queue
        if (!this.isPlaying) {
            await this._playQueue();
        }
    }

    /**
     * Play audio in queue
     * @private
     */
    async _playQueue() {
        while (this.queue.length > 0) {
            const { filePath, options } = this.queue.shift();
            try {
                await this.play(filePath, options);
            } catch (err) {
                // Ignore errors
                console.error('播放队列中的音频文件失败:', err);
            }
        }
    }

    /**
     * Stop current playback
     */
    stop() {
        if (this.isPlaying && this.currentPlayback) {
            try {
                // 终止当前播放进程
                this.currentPlayback.kill();
                this.currentPlayback = null;
                
                // 确保所有可能的相关进程都被终止
                try {
                    execSync('taskkill /F /IM wmplayer.exe /T', { stdio: 'ignore' });
                    execSync('taskkill /F /IM cscript.exe /T', { stdio: 'ignore' });
                } catch (e) {
                    // 忽略错误
                }
            } catch (e) {
                // Ignore errors
            }
            this.isPlaying = false;
            this.emit('stop');
        }
    }

    /**
     * Clear playback queue
     */
    clearQueue() {
        this.queue = [];
    }
}

module.exports = AudioPlayer; 