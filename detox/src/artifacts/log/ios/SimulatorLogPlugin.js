const _ = require('lodash');
const LogArtifactPlugin = require('../LogArtifactPlugin');
const SimulatorLogRecording = require('./SimulatorLogRecording');
const fs = require('fs-extra');
const log = require('../../../utils/logger').child({ __filename });
const tempfile = require('tempfile');
const { Tail } = require('tail');

class SimulatorLogPlugin extends LogArtifactPlugin {
  constructor(config) {
    super(config);

    this.appleSimUtils = config.appleSimUtils;
    this.tails = {
      stderr: null,
      stdout: null,
    };
  }

  async onBeforeLaunchApp(event) {
    await super.onBeforeLaunchApp(event);

    if (this.currentRecording) {
      await this.currentRecording.stop();
    }

    this._disposeTails();
  }

  async onLaunchApp(event) {
    await super.onLaunchApp(event);

    this._createTails(this.appleSimUtils.getLogsPaths(event.deviceId));

    if (this.currentRecording) {
      await this.currentRecording.start({
        tails: this.tails,
        readFromBeginning: true,
      });
    }
  }

  _createTails({ stdout, stderr }) {
    this._createTail(stdout, 'stdout');
    this._createTail(stderr, 'stderr');
  }

  _disposeTails() {
    this._unwatchTail('stdout');
    this._unwatchTail('stderr');
  }

  _createTail(file, prefix) {
    if (!fs.existsSync(file)) {
      log.warn({ event: 'LOG_MISSING' }, `simulator ${prefix} log is missing at path: ${file}`);
      return null;
    }

    log.trace({ event: 'TAIL_CREATE' }, `starting to watch ${prefix} log: ${file}`);

    const tail = new Tail(file, {
      fromBeginning: this._readFromBeginning,
      logger: {
        info: _.noop,
        error: (...args) => log.error({ event: 'TAIL_ERROR' }, ...args),
      },
    });
    this.tails[prefix] = tail;
  }

  _unwatchTail(prefix) {
    const tail = this.tails[prefix];

    if (tail) {
      log.trace({ event: 'TAIL_UNWATCH' }, `unwatching ${prefix} log`);
      tail.unwatch();
    }

    this.tails[prefix] = null;
  }

  createStartupRecording() {
    return this.createTestRecording(true);
  }

  createTestRecording(readFromBeginning = false) {
    return new SimulatorLogRecording({
      temporaryLogPath: tempfile('.log'),
      tails: this.tails,
      readFromBeginning,
    });
  }
}

module.exports = SimulatorLogPlugin;