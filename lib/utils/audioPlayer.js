"use strict";

const path = require("path");
const EventEmitter = require("events");
const fs = require("fs");
const { spawn } = require("child_process");
const os = require("os");

class AudioPlayer extends EventEmitter {
	constructor() {
		super();
		this.queue = [];
		this.isPlaying = false;
		this._isProcessing = false;

		this.playerScriptPath = path.join(os.tmpdir(), "guide_audio_player.vbs");
		this.process = null;
		this.currentPlayback = null;
		this.pendingResolves = [];
		this._stdoutBuffer = "";

		this._initPlayerScript();
	}

	_initPlayerScript() {
		const vbsContent = `
			Option Explicit
			Dim Sound, StdIn, StdOut, Line, DecodedPath, Retries, HasError
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
				Base64Decode = StreamBinaryToString(oNode.nodeTypedValue)
				Set oNode = Nothing
				Set oXML = Nothing
			End Function

			Function StreamBinaryToString(Binary)
				Dim BinaryStream
				Set BinaryStream = CreateObject("ADODB.Stream")
				BinaryStream.Type = 1
				BinaryStream.Open
				BinaryStream.Write Binary
				BinaryStream.Position = 0
				BinaryStream.Type = 2
				BinaryStream.Charset = "utf-8"
				StreamBinaryToString = BinaryStream.ReadText
				Set BinaryStream = Nothing
			End Function

			Do While Not StdIn.AtEndOfStream
				Line = StdIn.ReadLine()
				If Line = "QUIT" Then Exit Do

				If Line <> "" Then
					On Error Resume Next
					Err.Clear
					HasError = 0
					DecodedPath = Base64Decode(Line)

					If Err.Number <> 0 Then
						HasError = Err.Number
					Else
						Sound.URL = DecodedPath
						Sound.Controls.play

						Retries = 0
						Do While Sound.currentmedia.duration = 0 And Retries < 40
							WScript.Sleep 100
							Retries = Retries + 1
						Loop

						If Sound.currentmedia.duration > 0 Then
							WScript.Sleep (Int(Sound.currentmedia.duration) + 1) * 1000
						End If

						If Err.Number <> 0 Then HasError = Err.Number
					End If

					If HasError = 0 Then
						StdOut.WriteLine "DONE"
					Else
						StdOut.WriteLine "ERROR"
					End If
					On Error Goto 0
				End If
			Loop

			Sound.close
		`;

		try {
			fs.writeFileSync(this.playerScriptPath, vbsContent, "utf16le");
		} catch (e) {
			console.error("Failed to create audio player script:", e);
		}
	}

	_startProcess() {
		if (this.process) return;

		this.process = spawn("cscript.exe", ["/nologo", this.playerScriptPath], {
			windowsHide: true,
			stdio: ["pipe", "pipe", "ignore"]
		});
		this.currentPlayback = this.process;

		this.process.stdout.on("data", data => {
			this._stdoutBuffer += data.toString();
			const lines = this._stdoutBuffer.split(/\r?\n/);
			this._stdoutBuffer = lines.pop();

			lines.forEach(line => {
				const output = line.trim();
				if (output === "DONE")
					this._finishCurrent();
				else if (output === "ERROR")
					this._finishCurrent(new Error("Audio player failed"));
			});
		});

		this.process.on("close", () => {
			this.process = null;
			this.currentPlayback = null;
			this.isPlaying = false;
			this._stdoutBuffer = "";

			while (this.pendingResolves.length > 0) {
				const item = this.pendingResolves.shift();
				item.reject(new Error("Audio player process terminated"));
			}
		});

		this.process.on("error", err => this._finishCurrent(err));
	}

	_finishCurrent(err) {
		const item = this.pendingResolves.shift();
		if (!item) return;

		this.isPlaying = this.pendingResolves.length > 0;

		if (err) {
			if (this.listenerCount("error") > 0)
				this.emit("error", { error: err, filePath: item.filePath });
			item.reject(err);
		} else {
			this.emit("end", { filePath: item.filePath });
			item.resolve();
		}
	}

	_killProcess() {
		if (this.process) {
			try {
				this.process.stdin.write("QUIT\r\n");
				this.process.stdin.end();
			} catch (_) {
				this.process.kill();
			}
		}

		this.process = null;
		this.currentPlayback = null;
	}

	play(filePath) {
		return new Promise((resolve, reject) => {
			if (!fs.existsSync(filePath))
				return reject(new Error(`Audio file not found: ${filePath}`));

			try {
				this._startProcess();

				this.isPlaying = true;
				this.emit("play", { filePath });

				this.pendingResolves.push({ resolve, reject, filePath });

				const absolutePath = path.resolve(filePath);
				const encodedPath = Buffer.from(absolutePath, "utf8").toString("base64");
				this.process.stdin.write(`${encodedPath}\r\n`);
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
				console.error("Failed to play audio file in queue:", err);
			}
		}

		this._isProcessing = false;
	}

	stop() {
		this.clearQueue();
		this._killProcess();

		while (this.pendingResolves.length > 0) {
			const item = this.pendingResolves.shift();
			item.reject(new Error("Audio playback stopped"));
		}

		this.isPlaying = false;
		this._isProcessing = false;
		this.emit("stop");
	}

	clearQueue() {
		this.queue = [];
	}

	destroy() {
		this.stop();
		try {
			if (fs.existsSync(this.playerScriptPath))
				fs.unlinkSync(this.playerScriptPath);
		} catch (_) {
			// continue regardless of error
		}
	}
}

module.exports = AudioPlayer;
