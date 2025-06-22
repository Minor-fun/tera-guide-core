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
        this._isProcessing = false; // Add a processing lock to prevent concurrent queue processing
        // WMP path
        this.wmpPath = 'C:\\Program Files\\Windows Media Player\\wmplayer.exe';
        // Check if WMP exists
        if (!fs.existsSync(this.wmpPath)) {
            this.wmpPath = 'C:\\Program Files (x86)\\Windows Media Player\\wmplayer.exe';
            if (!fs.existsSync(this.wmpPath)) {
                console.warn('Windows Media Player not found, will use default command');
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
                    return reject(new Error(`Audio file not found: ${filePath}`));
                }
                
                // Use absolute path
                const absolutePath = path.resolve(filePath);
                
                // Play audio using Windows Media Player
                this.isPlaying = true;
                this.emit('play', { filePath: filePath });
                
                // Use a more reliable way to play audio
                // 1. Create a temporary VBS script to play the audio and close automatically
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
                
                fs.writeFileSync(tempScriptPath, vbsContent, 'utf16le');
                
                // Use spawn to run the VBS script
                this.currentPlayback = spawn('cscript.exe', ['/nologo', tempScriptPath], { 
                    windowsHide: true,
                    stdio: 'ignore',
                    detached: false
                });
                
                this.currentPlayback.on('close', (code) => {
                    // Delete the temporary script
                    try {
                        fs.unlinkSync(tempScriptPath);
                    } catch (e) {
                        // Ignore deletion failure
                    }
                    
                    this.isPlaying = false;
                    this.currentPlayback = null;
                    this.emit('end', { filePath });
                    this._isProcessing = false; // Release the processing lock
                    resolve();
                });
                
                this.currentPlayback.on('error', (err) => {
                    // Delete the temporary script
                    try {
                        fs.unlinkSync(tempScriptPath);
                    } catch (e) {
                        // Ignore deletion failure
                    }
                    
                    this.isPlaying = false;
                    this._isProcessing = false; // Release the processing lock
                    this.emit('error', { error: err, filePath });
                    reject(err);
                });
            } catch (err) {
                this.isPlaying = false;
                this._isProcessing = false; // Release the processing lock
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
        
        // If not currently playing and not processing, start playing the queue
        if (!this.isPlaying && !this._isProcessing) {
            this._isProcessing = true; // Set the processing lock
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
                console.error('Failed to play audio file in queue:', err);
            }
        }
    }

    /**
     * Stop current playback
     */
    stop() {
        if (this.isPlaying && this.currentPlayback) {
            try {
                // Terminate the current playback process
                this.currentPlayback.kill();
                this.currentPlayback = null;
                
                // Ensure all related processes are terminated
                try {
                    execSync('taskkill /F /IM wmplayer.exe /T', { stdio: 'ignore' });
                    execSync('taskkill /F /IM cscript.exe /T', { stdio: 'ignore' });
                } catch (e) {
                    // Ignore errors
                }
            } catch (e) {
                // Ignore errors
            }
            this.isPlaying = false;
            this._isProcessing = false; // Release the processing lock
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