jest.mock('../../../utils/argparse');

const tempfile = require('tempfile');
const fs = require('fs-extra');
const path = require('path');

describe('SimulatorLogPlugin', () => {
  let argparse;
  let fakePathBuilder;
  let fakeAppleSimUtils;
  let artifactsManager;
  let SimulatorLogPlugin;
  let ArtifactsManager;
  let createdArtifacts;

  beforeEach(() => {
    argparse = require('../../../utils/argparse');
    argparse.getArgValue.mockImplementation((key) => {
      switch (key) {
        case 'record-logs': return 'all';
        case 'loglevel': return 'trace';
        case 'artifacts-location': return path.dirname(tempfile(''));
        default: throw new Error(`unexpected argparse.getArgValue mock call: ${key}`);
      }
    });

    SimulatorLogPlugin = require('./SimulatorLogPlugin');
    ArtifactsManager = require('../../ArtifactsManager');

    createdArtifacts = [];
    fakePathBuilder = {
      buildPathForTestArtifact: jest.fn((_, summary) => {
        const artifactPath = tempfile(summary ? '.startup.log' : '.log');
        createdArtifacts.push(artifactPath);

        return artifactPath;
      }),
    };

    fakeAppleSimUtils = {
      logs: Object.freeze({
        stdout: tempfile('.stdout.log'),
        stderr: tempfile('.stderr.log'),
      }),

      getLogsPaths() {
        return this.logs;
      }
    };

    artifactsManager = new ArtifactsManager(fakePathBuilder);
    artifactsManager.registerArtifactPlugins({
      log: (api) => new SimulatorLogPlugin({
        api,
        appleSimUtils: fakeAppleSimUtils,
      }),
    })
  });

  it('should work through-out boots, launches and relaunches', async () => {
    debugger;

    await artifactsManager.onBootDevice({ deviceId: 'booted' });
    await fs.appendFile(fakeAppleSimUtils.logs.stdout, 'boot line\n');
    await fs.appendFile(fakeAppleSimUtils.logs.stderr, 'boot line\n');

    await artifactsManager.onBeforeLaunchApp({ device: 'booted', bundleId: 'com.test' });
    await fs.remove(fakeAppleSimUtils.logs.stdout);
    await fs.remove(fakeAppleSimUtils.logs.stderr);

    await artifactsManager.onLaunchApp({ device: 'booted', bundleId: 'com.test', pid: 8000 });
    await fs.appendFile(fakeAppleSimUtils.logs.stdout, 'launch line\n');
    await fs.appendFile(fakeAppleSimUtils.logs.stderr, 'launch line\n');

    await artifactsManager.onBeforeAll();

    await artifactsManager.onBeforeEach({ title: 'test', fullName: 'some test', status: 'running'});
    await fs.appendFile(fakeAppleSimUtils.logs.stdout, 'in-test line\n');
    await fs.appendFile(fakeAppleSimUtils.logs.stderr, 'in-test line\n');

    await artifactsManager.onBeforeLaunchApp({ device: 'booted', bundleId: 'com.test' });
    await fs.remove(fakeAppleSimUtils.logs.stdout);
    await fs.remove(fakeAppleSimUtils.logs.stderr);

    await artifactsManager.onLaunchApp({ device: 'booted', bundleId: 'com.test', pid: 8001 });
    await fs.appendFile(fakeAppleSimUtils.logs.stdout, 'post-relaunch line\n');
    await fs.appendFile(fakeAppleSimUtils.logs.stderr, 'post-relaunch line\n');

    await artifactsManager.onAfterEach({ title: 'test', fullName: 'some test', status: 'passed'});
    await artifactsManager.onAfterAll();

    expect(fakePathBuilder.buildPathForTestArtifact).toHaveBeenCalledTimes(2);
    for (const artifact of createdArtifacts) {
      const contents = await fs.readFile(artifact, 'utf8');
      expect(sanitizeGuids(contents)).toMatchSnapshot();
    }
  });

  function sanitizeGuids(str) {
    var guid = /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/ig;
    var blank = '00000000-0000-0000-0000-000000000000';

    return str.replace(guid, blank);
  }
});
