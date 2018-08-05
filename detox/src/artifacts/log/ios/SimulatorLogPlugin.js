const _ = require('lodash');
const fs = require('fs-extra');
const stream = require('stream');
const tempfile = require('tempfile');
const log = require('../../../utils/logger').child({ __filename });
const Artifact = require('../../templates/artifact/Artifact');
const LogArtifactPlugin = require('../LogArtifactPlugin');
const interruptProcess = require('../../../utils/interruptProcess');
const { spawnAndLog } = require('../../../utils/exec');

class SimulatorLogPlugin extends LogArtifactPlugin {
  constructor(config) {
    super(config);

    this.appleSimUtils = config.appleSimUtils;
    this.stdoutTailProcess = null;
    this.stderrTailProcess = null;
    this.parentStream = new stream.PassThrough();
  }

  async onBeforeLaunchApp(event) {
    await super.onBeforeLaunchApp(event);
    await this._tryTerminateTails();
  }

  async onLaunchApp(event) {
    await super.onLaunchApp(event);
    await this._spawnTails(event.deviceId);
  }

  async onShutdownDevice(event) {
    await this._tryTerminateTails();
  }

  async onAfterAll() {
    await this._tryTerminateTails();
  }

  async onTerminate() {
    await this._tryTerminateTails();
  }

  async _spawnTails(deviceId) {
    const { stdout, stderr } = this.appleSimUtils.getLogsPaths(deviceId);

    this.stdoutTailProcess = spawnAndLog('tail', [stdout], { silent: true });
    this.stderrTailProcess = spawnAndLog('tail', [stderr], { silent: true });

    this.stdoutTailProcess.childProcess.stdout.pipe(this.parentStream, { end: false });
    this.stderrTailProcess.childProcess.stdout.pipe(this.parentStream, { end: false });
  }

  async _tryTerminateTails() {
    if (this.stdoutTailProcess) {
      await interruptProcess(this.stdoutTailProcess);
      this.stdoutTailProcess = null;
    }

    if (this.stderrTailProcess) {
      await interruptProcess(this.stderrTailProcess);
      this.stderrTailProcess = null;
    }
  }

  createStartupRecording() {
    return this.createTestRecording();
  }

  createTestRecording() {
    const parentStream = this.parentStream;
    const logPath = tempfile('.log');
    let logStream = null;

    return new Artifact({
      name: 'SimulatorLogRecording',

      async start() {
        log.trace({ event: 'CREATE_STREAM '}, `creating append-only stream to: ${logPath}`);
        logStream = fs.createWriteStream(logPath, { flags: 'a' });
        parentStream.pipe(logStream);
      },

      async stop() {
        parentStream.unpipe(logStream);
        logStream.end();
      },

      async save(artifactPath) {
        if (await fs.exists(logPath)) {
          log.debug({ event: 'MOVE_FILE' }, `moving "${logPath}" to ${artifactPath}`);
          await fs.move(logPath, artifactPath);
        } else {
          log.error({ event: 'MOVE_FILE_ERROR'} , `did not find temporary log file: ${logPath}`);
        }
      },

      async discard() {
        await fs.remove(logPath);
      }
    });
  }
}

module.exports = SimulatorLogPlugin;