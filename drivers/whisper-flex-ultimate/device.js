'use strict';

const Homey = require('homey');
const axios = require('axios');
const https = require('https');
const httpsAgent = new https.Agent({
  keepAlive: true,
  keepAliveMsecs: 10000,
  maxSockets: 10,
  maxFreeSockets: 4,
  timeout: 30000,
});
const apiClient = axios.create({
  baseURL: 'https://v5.api.cloudgarden.nl',
  httpsAgent,
  timeout: 10000,
});

module.exports = class WhisperFlexUltimateDevice extends Homey.Device {

  /**
   * onInit is called when the device is initialized.
   */
  async onInit() {
    try {
      this.log('Whisper Flex Ultimate device has been initialized');
      this.registerCapabilityListener("onoff", async (value) => {
        let command;
        if (value === true) {
          command = "tune set power 1";
        } else {
          command = "tune set power 0";
        }
        await this.sendCommand(command);
      });

      this.registerCapabilityListener("fan_speed", async (value) => {
        let command;
        command = `tune set speed ${value}`;
        await this.sendCommand(command);
      });

      this.registerCapabilityListener("whisper_ultimate_mode", async (value) => {
        let command;
        if (value === "normal") {
          command = "tune set mode 0";
        } else if (value === "nature") {
          command = "tune set mode 1";
        } else if (value === "night") {
          command = "tune set mode 2";
        } else return;
        await this.sendCommand(command);
      });

      // migrations

      if (this.hasCapability('horizontal_oscillation')) {
        await this.removeCapability('horizontal_oscillation');
      }

      if (!this.hasCapability('horizontal_oscillation_ultimate')) {
        await this.addCapability('horizontal_oscillation_ultimate');
      }
      // end migrations

      if (this.hasCapability('horizontal_oscillation')) {
        this.registerCapabilityListener("horizontal_oscillation", async (value) => {
          let command;
          if (value === true) {
            command = "tune set swing 1";
          } else if (value === false) {
            command = "tune set swing 0";
          } else return;
          await this.sendCommand(command);
        });
      }

      if (this.hasCapability('horizontal_oscillation_ultimate')) {
        this.registerCapabilityListener("horizontal_oscillation_ultimate", async (value) => {
          let command;
          if (value === "30") {
            command = "tune set swing 1";
          } else if (value === "60") {
            command = "tune set swing 2";
          } else if (value === "90") {
            command = "tune set swing 3";
          } else if (value === "off") {
            command = "tune set swing 0";
          } else return;
          await this.sendCommand(command);
        });
      }

      this.startPolling();

      const enableHorizontalOscillationAction = this.homey.flow.getActionCard('enable_horizontal_oscillation_ultimate');
      const disableHorizontalOscillationAction = this.homey.flow.getActionCard('disable_horizontal_oscillation_ultimate');
      const enableVerticalOscillationAction = this.homey.flow.getActionCard('enable_vertical_oscillation_ultimate');
      const disableVerticalOscillationAction = this.homey.flow.getActionCard('disable_vertical_oscillation_ultimate');
      const setModeAction = this.homey.flow.getActionCard('set_whisper_flex_mode_ultimate');
      const horizontalOscillationCondition = this.homey.flow.getConditionCard('horizontal_oscillation_condition_ultimate');
      const modeCondition = this.homey.flow.getConditionCard('mode_condition_ultimate');
      const horizontalOscillationCondition2 = this.homey.flow.getConditionCard('horosc_condition_ultimate');
      const setHorizontalOscillationAction = this.homey.flow.getActionCard('set_horosc_ultimate');
      const setVerticalOscillationAction = this.homey.flow.getActionCard('set_verosc_ultimate');

      horizontalOscillationCondition.registerRunListener(async (args, state) => {
        const isSwing = this.getCapabilityValue('horizontal_oscillation');
        return isSwing;
      });

      setModeAction.registerRunListener(async (args, state) => {
        if (args.mode === 'normal') {
          await this.sendCommand("tune set mode 0");
        } else if (args.mode === 'nature') {
          await this.sendCommand("tune set mode 1");
        } else if (args.mode === 'night') {
          await this.sendCommand("tune set mode 2");
        }
        return true;
      });

      setHorizontalOscillationAction.registerRunListener(async (args, state) => {
        if (args.mode === '30') {
          await this.sendCommand("tune set swing 1");
        } else if (args.mode === '60') {
          await this.sendCommand("tune set swing 2");
        } else if (args.mode === '90') {
          await this.sendCommand("tune set swing 3");
        } else if (args.mode === 'off') {
          await this.sendCommand("tune set swing 0");
        }
        return true;
      });

      setVerticalOscillationAction.registerRunListener(async (args, state) => {
        if (args.mode === "105") {
          await this.sendCommand("tune set tilt 2");
        } else if (args.mode === "90") {
          await this.sendCommand("tune set tilt 1");
        } else if (args.mode === "off") {
          await this.sendCommand("tune set tilt 0");
        }
        return true;
      });

      modeCondition.registerRunListener(async (args, state) => {
        const mode = this.getCapabilityValue('whisper_ultimate_mode');
        return mode === args.mode;
      });

      horizontalOscillationCondition2.registerRunListener(async (args, state) => {
        const swing = this.getCapabilityValue('horizontal_oscillation_ultimate');
        return swing === args.mode;
      });

      enableHorizontalOscillationAction.registerRunListener(async (args, state) => {
        await this.sendCommand("tune set swing 1");
        return true;
      });

      disableHorizontalOscillationAction.registerRunListener(async (args, state) => {
        await this.sendCommand("tune set swing 0");
        return true;
      });

      enableVerticalOscillationAction.registerRunListener(async (args, state) => {
        await this.sendCommand("tune set tilt 1");
        return true;
      });

      disableVerticalOscillationAction.registerRunListener(async (args, state) => {
        await this.sendCommand("tune set tilt 0");
        return true;
      });
    } catch (error) {
      this.error('Error during Whisper Flex device initialization:', error);
    }
  }

  /**
   * onAdded is called when the user adds the device, called just after pairing.
   */
  async onAdded() {
    this.log('Whisper Flex Ultimate device has been added');
  }

  /**
   * onSettings is called when the user updates the device's settings.
   * @param {object} event the onSettings event data
   * @param {object} event.oldSettings The old settings object
   * @param {object} event.newSettings The new settings object
   * @param {string[]} event.changedKeys An array of keys changed since the previous version
   * @returns {Promise<string|void>} return a custom message that will be displayed
   */
  async onSettings({ oldSettings, newSettings, changedKeys }) {
    this.log('Whisper Flex Ultimate device settings where changed');
  }

  /**
   * onRenamed is called when the user updates the device's name.
   * This method can be used this to synchronise the name to the device.
   * @param {string} name The new name
   */
  async onRenamed(name) {
    this.log('Whisper Flex Ultimate device was renamed');
  }

  /**
   * onDeleted is called when the user deleted the device.
   */
  async onDeleted() {
    this.log('Whisper Flex Ultimate device has been deleted');
    this.stopPolling();
  }

  startPolling() {
    this.stopPolling();
    this.pollDeviceStatus();
    this.pollInterval = this.homey.setInterval(() => {
      this.pollDeviceStatus();
    }, 15000);
  }

  stopPolling() {
    if (this.pollInterval) {
      this.homey.clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
  }

  async pollDeviceStatus() {
    try {
      const accessToken = this.homey.settings.get('accessToken');
      const mac = this.getStoreValue('mac');
      
      if (!accessToken || !mac) {
        this.error('Missing accessToken or MAC address');
        return;
      }

      const response = await apiClient.get(
        `/data/${mac}/status`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`
          }
        }
      );

      const status = response.data.data;
      
      if (status) {
        // Update onoff capability
        const isOn = status.power === 1;
        await this.setAvailable();
        if (this.hasCapability('onoff')) {
          await this.setCapabilityValue('onoff', isOn).catch(err => {
            this.error('Error setting onoff capability:', err);
          });
        }

        // Update fan speed capability
        if (this.hasCapability('fan_speed') && status.sp !== undefined) {
          const speed = status.speed;
          await this.setCapabilityValue('fan_speed', speed).catch(err => {
            this.error('Error setting fan speed capability:', err);
          });
        }

        // Log if device is in error state
        if (status.err && status.err !== 0) {
          this.error('Device reported error code:', status.err);
        }

        if (this.hasCapability('whisper_ultimate_mode') && status.mode !== undefined) {
          let modeValue;
          if (status.mode === 0) {
            modeValue = "normal";
          } else if (status.mode === 1) {
            modeValue = "nature";
          } else if (status.mode === 2) {
            modeValue = "night";
          } else return;
          await this.setCapabilityValue('whisper_ultimate_mode', modeValue).catch(err => {
            this.error('Error setting mode capability:', err);
          });
        }

        if (this.hasCapability('horizontal_oscillation_ultimate') && status.swing !== undefined) {
          let swingValue;
          if (status.swing === 0) {
            swingValue = "off";
          } else if (status.swing === 1) {
            swingValue = "30";
          } else if (status.swing === 2) {
            swingValue = "60";
          } else if (status.swing === 3) {
            swingValue = "90";
          } else return;
          await this.setCapabilityValue('horizontal_oscillation_ultimate', swingValue).catch(err => {
            this.error('Error setting horizontal oscillation capability:', err);
          });
        }
      }
    } catch (error) {
      this.error('Error polling device status:', error.message);
      
      if (error.response && error.response.status === 401) {
        await this.setUnavailable('Authentication required. Please re-login.').catch(err => {
          this.error('Error setting unavailable:', err);
        });
      }
    }
  }

  async sendCommand(command) {
    try {
      const accessToken = this.homey.settings.get('accessToken');
      const mac = this.getStoreValue('mac');
      
      if (!accessToken || !mac) {
        this.error('Missing accessToken or MAC address');
      }

      await apiClient.post(
        `/sensor/${mac}/commands`,
        {
          command: command
        },
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          }
        }
      );
      
      return true;
    } catch (error) {
      this.error('Error controlling device:', error.message);
    }
  }

};