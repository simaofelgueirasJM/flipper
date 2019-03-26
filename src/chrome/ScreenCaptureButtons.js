/**
 * Copyright 2018-present Facebook.
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 * @format
 */

import {Button, ButtonGroup, Component} from 'flipper';
import {connect} from 'react-redux';
import AndroidDevice from '../devices/AndroidDevice';
import IOSDevice from '../devices/IOSDevice';
import os from 'os';
import fs from 'fs';
import adb from 'adbkit-fb';
import {exec} from 'child_process';
import {remote} from 'electron';
import path from 'path';

let CAPTURE_LOCATION = remote.app.getPath('desktop');
try {
  CAPTURE_LOCATION =
    JSON.parse(window.process.env.CONFIG).screenCapturePath.replace(
      /^~/,
      os.homedir(),
    ) || CAPTURE_LOCATION;
} catch (e) {}

import type BaseDevice from '../devices/BaseDevice';

type PullTransfer = any;

type Props = {|
  selectedDevice: ?BaseDevice,
|};

type State = {|
  pullingData: boolean,
  recording: boolean,
  recordingEnabled: boolean,
  capturingScreenshot: boolean,
|};

function openFile(path: string): Promise<string> {
  return new Promise((resolve, reject) => {
    exec(`${getOpenCommand()} "${path}"`, (error, stdout, stderr) => {
      if (error) {
        reject(error);
      } else {
        resolve(path);
      }
    });
  });
}

function getOpenCommand(): string {
  //TODO: TESTED ONLY ON MAC!
  switch (os.platform()) {
    case 'win32':
      return 'start';
    case 'linux':
      return 'xdg-open';
    default:
      return 'open';
  }
}

function getFileName(extension: 'png' | 'mp4'): string {
  return `Screen Capture ${new Date().toISOString()}.${extension}`;
}

function writePngStreamToFile(stream: PullTransfer): Promise<string> {
  return new Promise((resolve, reject) => {
    const pngPath = path.join(CAPTURE_LOCATION, getFileName('png'));
    stream.on('end', () => {
      resolve(pngPath);
    });
    stream.on('error', reject);
    stream.pipe(fs.createWriteStream(pngPath));
  });
}

class ScreenCaptureButtons extends Component<Props, State> {
  iOSRecorder: ?any;
  videoPath: ?string;

  state = {
    pullingData: false,
    recording: false,
    recordingEnabled: false,
    capturingScreenshot: false,
  };

  componentDidMount() {
    this.checkIfRecordingIsAvailable();
  }

  componentWillReceiveProps(nextProps: Props) {
    this.checkIfRecordingIsAvailable(nextProps);
  }

  checkIfRecordingIsAvailable = (props: Props = this.props): void => {
    const {selectedDevice} = props;

    if (selectedDevice instanceof AndroidDevice) {
      this.executeShell(
        selectedDevice,
        `[ ! -f /system/bin/screenrecord ] && echo "File does not exist"`,
      ).then(output =>
        this.setState({
          recordingEnabled: !output,
        }),
      );
    } else if (
      selectedDevice instanceof IOSDevice &&
      selectedDevice.deviceType === 'emulator'
    ) {
      this.setState({
        recordingEnabled: true,
      });
    } else {
      this.setState({
        recordingEnabled: false,
      });
    }
  };

  captureScreenshot = (): ?Promise<string> => {
    const {selectedDevice} = this.props;

    if (selectedDevice instanceof AndroidDevice) {
      return selectedDevice.adb
        .screencap(selectedDevice.serial)
        .then(writePngStreamToFile)
        .then(openFile)
        .catch(console.error);
    } else if (selectedDevice instanceof IOSDevice) {
      const screenshotPath = path.join(CAPTURE_LOCATION, getFileName('png'));
      return new Promise((resolve, reject) => {
        exec(
          `xcrun simctl io booted screenshot "${screenshotPath}"`,
          async (err, data) => {
            if (err) {
              reject(err);
            } else {
              resolve(await openFile(screenshotPath));
            }
          },
        );
      });
    }
  };

  startRecording = () => {
    const {selectedDevice} = this.props;
    const videoPath = path.join(CAPTURE_LOCATION, getFileName('mp4'));
    this.videoPath = videoPath;
    if (selectedDevice instanceof AndroidDevice) {
      this.setState({
        recording: true,
      });
      this.executeShell(
        selectedDevice,
        `screenrecord --bugreport /sdcard/video.mp4`,
      )
        .then(output => {
          if (output) {
            throw output;
          }
        })
        .then(() => {
          this.setState({
            recording: false,
            pullingData: true,
          });
        })
        .then(
          (): Promise<string> => {
            return this.pullFromDevice(
              selectedDevice,
              `/sdcard/video.mp4`,
              videoPath,
            );
          },
        )
        .then(openFile)
        .then(() => {
          this.executeShell(selectedDevice, `rm /sdcard/video.mp4`);
        })
        .then(() => {
          this.setState({
            pullingData: false,
          });
        })
        .catch(error => {
          console.error(`unable to capture video: ${error}`);
          this.setState({
            recording: false,
            pullingData: false,
          });
        });
    } else if (selectedDevice instanceof IOSDevice) {
      this.setState({
        recording: true,
      });
      this.iOSRecorder = exec(
        `xcrun simctl io booted recordVideo "${videoPath}"`,
      );
    }
  };

  pullFromDevice = (
    device: AndroidDevice,
    src: string,
    dst: string,
  ): Promise<string> => {
    return new Promise((resolve, reject) => {
      return device.adb.pull(device.serial, src).then(stream => {
        stream.on('end', () => {
          resolve(dst);
        });
        stream.on('error', reject);
        stream.pipe(fs.createWriteStream(dst));
      });
    });
  };

  stopRecording = () => {
    const {videoPath} = this;
    const {selectedDevice} = this.props;
    this.videoPath = null;

    if (selectedDevice instanceof AndroidDevice) {
      this.executeShell(selectedDevice, `pgrep 'screenrecord' -L 2`);
    } else if (this.iOSRecorder && videoPath) {
      this.iOSRecorder.kill('SIGINT');
      this.setState({
        recording: false,
      });
      openFile(videoPath);
    }
  };

  executeShell = (device: AndroidDevice, command: string): Promise<string> => {
    return device.adb
      .shell(device.serial, command)
      .then(adb.util.readAll)
      .then(output => output.toString().trim());
  };

  onRecordingClicked = () => {
    if (this.state.recording) {
      this.stopRecording();
    } else {
      this.startRecording();
    }
  };

  render() {
    const {recordingEnabled} = this.state;
    const {selectedDevice} = this.props;

    return (
      <ButtonGroup>
        <Button
          compact={true}
          onClick={this.captureScreenshot}
          icon="camera"
          title="Take Screenshot"
          disabled={!selectedDevice}
        />
        <Button
          compact={true}
          onClick={this.onRecordingClicked}
          icon={this.state.recording ? 'stop-playback' : 'camcorder'}
          pulse={this.state.recording}
          selected={this.state.recording}
          title="Make Screen Recording"
          disabled={!selectedDevice || !recordingEnabled}
        />
      </ButtonGroup>
    );
  }
}

export default connect(({connections: {selectedDevice}}) => ({
  selectedDevice,
}))(ScreenCaptureButtons);
