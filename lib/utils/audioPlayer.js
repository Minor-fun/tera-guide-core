"use strict";

const path = require("path");
const EventEmitter = require("events");
const fs = require("fs");
const { spawn } = require("child_process");
const os = require("os");
const { performance } = require("perf_hooks");
const { randomBytes } = require("crypto");

const MAX_WAITING_AUDIO = 5;
const MAX_QUEUE_WAIT_MS = 5000;

class AudioPlayer extends EventEmitter {
	constructor() {
		super();
		this.queue = [];
		this.isPlaying = false;
		this._isProcessing = false;

		this.playerScriptPath = path.join(os.tmpdir(), `guide_audio_player_${randomBytes(12).toString("hex")}.vbs`);
		this.process = null;
		this.pendingResolves = [];
		this._stdoutBuffer = "";
		this._queueTimer = null;

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
							WScript.Sleep Int(Sound.currentmedia.duration * 1000) + 200
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

		const playerProcess = spawn("cscript.exe", ["/nologo", this.playerScriptPath], {
			windowsHide: true,
			stdio: ["pipe", "pipe", "ignore"]
		});
		this.process = playerProcess;

		playerProcess.stdout.on("data", data => {
			if (this.process !== playerProcess) return;
			this._stdoutBuffer += data.toString();
			const lines = this._stdoutBuffer.split(/\r?\n/);
			this._stdoutBuffer = lines.pop();

			lines.forEach(line => {
				if (this.process !== playerProcess) return;
				const output = line.trim();
				if (output === "DONE")
					this._finishCurrent();
				else if (output === "ERROR")
					this._finishCurrent(new Error("Audio player failed"));
			});
		});

		playerProcess.on("close", () => {
			if (this.process !== playerProcess) return;
			this.process = null;
			this.isPlaying = false;
			this._stdoutBuffer = "";

			this._finishCurrent(new Error("Audio player process terminated"));
		});

		const onProcessError = err => {
			if (this.process !== playerProcess) return;
			this._killProcess();
			this._finishCurrent(err);
		};
		playerProcess.on("error", onProcessError);
		playerProcess.stdin.on("error", onProcessError);
	}

	_finishCurrent(err) {
		const item = this.pendingResolves.shift();
		if (!item) return;

		this.isPlaying = false;

		if (err) {
			item.reject(err);
			if (this.listenerCount("error") > 0)
				this.emit("error", { error: err, filePath: item.filePath });
		} else {
			item.resolve();
			this.emit("end", { filePath: item.filePath });
		}
		this._playQueue();
	}

	_killProcess() {
		const playerProcess = this.process;
		this.process = null;
		this._stdoutBuffer = "";
		if (playerProcess) {
			try { playerProcess.kill(); } catch (_) { /* already terminated */ }
		}
	}

	play(filePath) {
		return new Promise((resolve, reject) => {
			if (!fs.existsSync(filePath))
				return reject(new Error(`Audio file not found: ${filePath}`));

			this._pruneQueue();
			if (this.queue.length >= MAX_WAITING_AUDIO) {
				const dropped = this.queue.shift();
				dropped.reject(Object.assign(new Error("Audio playback queue is full"), { code: "EQUEUEFULL" }));
			}
			this.queue.push({ resolve, reject, filePath, queuedAt: performance.now() });
			this._resetQueueTimer();
			this._playQueue();
		});
	}

	_pruneQueue() {
		const now = performance.now();
		while (this.queue.length > 0 && now - this.queue[0].queuedAt >= MAX_QUEUE_WAIT_MS) {
			const item = this.queue.shift();
			item.reject(Object.assign(new Error("Audio playback request expired"), { code: "ESTALE" }));
		}
	}

	_resetQueueTimer() {
		clearTimeout(this._queueTimer);
		this._queueTimer = null;
		if (this.queue.length === 0) return;
		const delay = Math.max(0, this.queue[0].queuedAt + MAX_QUEUE_WAIT_MS - performance.now());
		this._queueTimer = setTimeout(() => {
			this._queueTimer = null;
			this._pruneQueue();
			this._resetQueueTimer();
		}, delay);
		this._queueTimer.unref();
	}

	_playQueue() {
		if (this.isPlaying || this._isProcessing) return;
		this._isProcessing = true;
		this._pruneQueue();
		const item = this.queue.shift();
		this._resetQueueTimer();
		if (!item) {
			this._isProcessing = false;
			return;
		}

		this.pendingResolves.push(item);
		this.isPlaying = true;
		try {
			this._startProcess();
			this.emit("play", { filePath: item.filePath });
			if (this.pendingResolves[0] === item && this.process) {
				const absolutePath = path.resolve(item.filePath);
				const encodedPath = Buffer.from(absolutePath, "utf8").toString("base64");
				this.process.stdin.write(`${encodedPath}\r\n`);
			}
		} catch (err) {
			this._killProcess();
			this._finishCurrent(err);
		} finally {
			this._isProcessing = false;
			if (!this.isPlaying) this._playQueue();
		}
	}

	stop() {
		this.clearQueue();
		this._killProcess();

		while (this.pendingResolves.length > 0) {
			const item = this.pendingResolves.shift();
			item.reject(Object.assign(new Error("Audio playback stopped"), { code: "ECANCELED" }));
		}

		this.isPlaying = false;
		this._isProcessing = false;
		this.emit("stop");
	}

	clearQueue() {
		while (this.queue.length > 0) {
			const item = this.queue.shift();
			item.reject(Object.assign(new Error("Audio playback stopped"), { code: "ECANCELED" }));
		}
		this._resetQueueTimer();
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
