"use strict";

const path = require('path');
const EventEmitter = require('events');
const fs = require('fs');
const { execSync, execFile } = require('child_process');

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
                
                // 直接使用 WMP 命令行播放
                const args = ['/play', '/close', absolutePath];
                
                // 使用 execFile 启动 WMP
                this.currentPlayback = execFile(this.wmpPath, args, { 
                    windowsHide: true,
                    stdio: 'ignore'
                }, (error, stdout, stderr) => {
                    if (error) {
                        this.isPlaying = false;
                        this.emit('error', { error, filePath });
                        reject(error);
                    } else {
                        this.isPlaying = false;
                        this.emit('end', { filePath });
                        resolve();
                    }
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
                
                // 确保所有 WMP 进程都被终止
                try {
                    execSync('taskkill /F /IM wmplayer.exe /T', { stdio: 'ignore' });
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