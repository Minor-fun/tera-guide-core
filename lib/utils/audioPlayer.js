"use strict";

const path = require('path');
const EventEmitter = require('events');
const fs = require('fs');
const { execSync, spawn } = require('child_process');
const sound = require('sound-play');

class AudioPlayer extends EventEmitter {
    constructor() {
        super();
        this.currentPlayback = null;
        this.queue = [];
        this.isPlaying = false;
        this.sound = sound;
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
                    return reject(new Error(`Audio file does not exist: ${filePath}`));
                }
                
                // Play audio
                this.isPlaying = true;
                this.emit('play', { filePath: filePath });
                
                this.sound.play(filePath, options.volume / 100)
                    .then(() => {
                        this.isPlaying = false;
                        this.emit('end', { filePath: filePath });
                        resolve();
                    })
                    .catch(err => {
                        this.isPlaying = false;
                        this.emit('error', { error: err, filePath: filePath });
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
            }
        }
    }

    /**
     * Stop current playback
     */
    stop() {
        if (this.isPlaying) {
            try {
                // Stop all Windows Media Player processes
                execSync('taskkill /F /IM wmplayer.exe', { stdio: 'ignore' });
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