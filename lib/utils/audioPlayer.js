"use strict";

const path = require('path');
const EventEmitter = require('events');
const fs = require('fs');
const { spawn } = require('child_process');
const os = require('os');

class AudioPlayer extends EventEmitter {
    constructor() {
        super();
        this.queue = [];
        this.isPlaying = false;
        this._isProcessing = false;
        
        this.playerScriptPath = path.join(os.tmpdir(), 'guide_audio_player.vbs');
        
        this.process = null;
        this.idleTimer = null;
        this.pendingResolves = [];
        
        this._initPlayerScript();
    }

    _initPlayerScript() {
        // 优化：常驻进程脚本，使用 Base64 传递路径，解决中文路径编码问题
        const vbsContent = `
            Option Explicit
            Dim Sound, StdIn, StdOut, Line
            Set StdIn = WScript.StdIn
            Set StdOut = WScript.StdOut
            Set Sound = CreateObject("WMPlayer.OCX.7")
            Sound.settings.volume = 100
            
            Function Base64Decode(ByVal vCode)
                Dim oXML, oNode
                Set oXML = CreateObject("Msxml2.DOMDocument.3.0")
                Set oNode = oXML.CreateElement("base64")
                oNode.dataType = "bin.base64"
                oNode.text = vCode
                Base64Decode = Stream_BinaryToString(oNode.nodeTypedValue)
                Set oNode = Nothing
                Set oXML = Nothing
            End Function

            Function Stream_BinaryToString(Binary)
                Dim BinaryStream
                Set BinaryStream = CreateObject("ADODB.Stream")
                BinaryStream.Type = 1
                BinaryStream.Open
                BinaryStream.Write Binary
                BinaryStream.Position = 0
                BinaryStream.Type = 2
                BinaryStream.Charset = "utf-8"
                Stream_BinaryToString = BinaryStream.ReadText
                Set BinaryStream = Nothing
            End Function

            Do While Not StdIn.AtEndOfStream
                Line = StdIn.ReadLine()
                If Line = "QUIT" Then Exit Do
                
                If Line <> "" Then
                    On Error Resume Next
                    Dim decodedPath
                    decodedPath = Base64Decode(Line)
                    
                    If Err.Number = 0 Then
                        Sound.URL = decodedPath
                        Sound.Controls.play
                        
                        ' 等待媒体加载
                        Dim retries
                        retries = 0
                        Do While Sound.currentmedia.duration = 0 And retries < 40
                            WScript.Sleep 50
                            retries = retries + 1
                        Loop
                        
                        ' 等待播放结束
                        If Sound.currentmedia.duration > 0 Then
                            WScript.Sleep Int(Sound.currentmedia.duration * 1000) + 200
                        End If
                    End If
                    
                    StdOut.WriteLine "DONE"
                    On Error Goto 0
                End If
            Loop
            Sound.close
        `;

        try {
            fs.writeFileSync(this.playerScriptPath, vbsContent, 'utf16le');
        } catch (e) {
            console.error('Failed to create audio player script:', e);
        }
    }

    _startProcess() {
        if (this.process) return;

        this.process = spawn('cscript.exe', [
            '/nologo', 
            this.playerScriptPath
        ], {
            windowsHide: true,
            stdio: ['pipe', 'pipe', 'ignore']
        });

        this.process.stdout.on('data', (data) => {
            const lines = data.toString().split(/\r?\n/);
            for (const line of lines) {
                if (line.trim() === 'DONE') {
                    const item = this.pendingResolves.shift();
                    if (item) {
                        this.isPlaying = false;
                        this.emit('end', { filePath: item.filePath });
                        item.resolve();
                        this._resetIdleTimer(); // 播放结束后开始5分钟倒计时
                    }
                }
            }
        });

        this.process.on('close', () => {
            this.process = null;
            // 如果进程意外关闭，拒绝所有挂起的请求
            while (this.pendingResolves.length > 0) {
                const item = this.pendingResolves.shift();
                item.reject(new Error('Audio player process terminated'));
            }
        });
        
        this.process.on('error', (err) => {
             console.error('Audio player process error:', err);
        });
    }

    _resetIdleTimer() {
        if (this.idleTimer) clearTimeout(this.idleTimer);
        this.idleTimer = setTimeout(() => {
            this._killProcess();
        }, 5 * 60 * 1000); // 5分钟无操作销毁进程
    }

    _killProcess() {
        if (this.process) {
            try {
                this.process.stdin.write("QUIT\r\n");
            } catch (e) {
                this.process.kill();
            }
            this.process = null;
        }
        if (this.idleTimer) clearTimeout(this.idleTimer);
    }

    play(filePath, options = {}) {
        return new Promise((resolve, reject) => {
            if (!fs.existsSync(filePath)) {
                return reject(new Error(`Audio file not found: ${filePath}`));
            }

            const absolutePath = path.resolve(filePath);
            
            try {
                this._startProcess();
                
                // 播放期间清除空闲计时器，防止播放长音频时被杀
                if (this.idleTimer) clearTimeout(this.idleTimer);
                
                this.isPlaying = true;
                this.emit('play', { filePath });
                
                this.pendingResolves.push({
                    resolve,
                    reject,
                    filePath
                });
                
                const base64Path = Buffer.from(absolutePath, 'utf8').toString('base64');
                this.process.stdin.write(base64Path + '\r\n');
            } catch (err) {
                this.isPlaying = false;
                reject(err);
            }
        });
    }

    async queueAndPlay(filePath, options = {}) {
        this.queue.push({ filePath, options });
        
        if (!this.isPlaying && !this._isProcessing) {
            this._isProcessing = true;
            await this._playQueue();
        }
    }

    async _playQueue() {
        while (this.queue.length > 0) {
            const { filePath, options } = this.queue.shift();
            try {
                await this.play(filePath, options);
            } catch (err) {
                console.error('Failed to play audio file in queue:', err);
            }
        }
        if (this.queue.length === 0) {
            this._isProcessing = false;
        }
    }

    stop() {
        this.queue = [];
        this._killProcess(); // 停止播放需要杀掉当前进程
        this.isPlaying = false;
        this.emit('stop');
        this._isProcessing = false; 
    }

    destroy() {
        this.stop();
        try {
            if (fs.existsSync(this.playerScriptPath)) {
                fs.unlinkSync(this.playerScriptPath);
            }
        } catch (e) {}
    }
}

module.exports = AudioPlayer;
