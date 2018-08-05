const _ = require('lodash');
const fs = require('fs-extra');
const log = require('../../../utils/logger').child({ __filename });
const { Tail } = require('tail');
const Artifact = require('../../templates/artifact/Artifact');

class SimulatorLogRecording extends Artifact {
  constructor({
    tails,
    readFromBeginning,
    temporaryLogPath,
  }) {
    super();

    this._readFromBeginning = readFromBeginning;
    this._logPath = temporaryLogPath;
    this._tails = tails;
    this._listeners = {
      stdout: null,
      stderr: null,
    };
  }

  async doStart(overrides) {
    this._updateWithOverrides(overrides);
    this._createWriteableStream();
    this._listeners.stdout = this._subscribeToTail('stdout');
    this._listeners.stderr = this._subscribeToTail('stderr');
  }

  _updateWithOverrides({ readFromBeginning, tails } = {}) {
    if (readFromBeginning !== undefined) {
      this._readFromBeginning = readFromBeginning;
    }

    if (tails !== undefined) {
      this._tails = tails;
    }
  }

  _createWriteableStream() {
    log.trace({ event: 'CREATE_STREAM '}, `creating append-only stream to: ${this._logPath}`);
    this._logStream = fs.createWriteStream(this._logPath, { flags: 'a' });
  }

  _subscribeToTail(prefix) {
    const tail = this._tails[prefix];
    const fromBeginning = this._readFromBeginning;

    if (tail) {
      const callback = (line) => this._appendLine(prefix, line);
      tail.on('line', callback);

      if (fromBeginning) {
        this._triggerTailReadUsingHack(tail);
      }

      return callback;
    }
  }

  _unsubscribeFromTail(prefix) {
    const tail = this._tails[prefix];
    const listener = this._listeners[prefix];

    if (tail && listener) {
      tail.off('line', callback);
      this._listeners[prefix] = null;
    }
  }

  /***
   * @link https://github.com/lucagrulla/node-tail/issues/40
   */
  _triggerTailReadUsingHack(tail) {
    tail.watchEvent.call(tail, "change");
  }

  async doStop() {
    this._unsubscribeFromTail('stdout');
    this._unsubscribeFromTail('stderr');
    this._closeLogStream();
  }

  async doSave(artifactPath) {
    const tempLogPath = this._logPath;

    if (await fs.exists(tempLogPath)) {
      log.debug({ event: 'MOVE_FILE' }, `moving "${tempLogPath}" to ${artifactPath}`);
      await fs.move(tempLogPath, artifactPath);
    } else {
      log.error({ event: 'MOVE_FILE_ERROR'} , `did not find temporary log file: ${tempLogPath}`);
    }
  }

  async doDiscard() {
    await fs.remove(this._logPath);
  }


  async _closeLogStream() {
    if (this._logStream) {
      log.trace({ event: 'CLOSING_STREAM '}, `closing stream to: ${this._logPath}`);
      await new Promise((resolve) => this._logStream.end());
    }

    this._logStream = null;
  }

  _appendStdout(line) {
    return this._appendLine('stdout', line);
  }

  _appendStderr(line) {
    return this._appendLine('stderr', line);
  }

  _appendLine(prefix, line) {
    if (this._logStream) {
      this._logStream.write(prefix);
      this._logStream.write(': ');
      this._logStream.write(line);
      this._logStream.write('\n');
    } else {
      log.warn({ event: 'LOG_WRITE_ERROR' }, 'failed to add line to log:\n' + line);
    }
  }
}

module.exports = SimulatorLogRecording;

