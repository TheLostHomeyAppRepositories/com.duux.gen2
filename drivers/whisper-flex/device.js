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

module.exports = class WhisperFlexDevice extends Homey.Device {

  /**
   * onInit is called when the device is initialized.
   */
  async onInit() {
    try {
      this.log('Whisper Flex device has been initialized');
      
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

      this.registerCapabilityListener("whisper_mode", async (value) => {
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

      this.registerCapabilityListener("horizontal_oscillation", async (value) => {
        let command;
        if (value === true) {
          command = "tune set swing 1";
        } else if (value === false) {
          command = "tune set swing 0";
        } else return;
        await this.sendCommand(command);
      });

      this.homey.settings.set('firstRun', true);

      // Start polling
      this.startPolling();
    } catch (error) {
      this.error('Error during Whisper Flex device initialization:', error);
    }
  }

  /**
   * onAdded is called when the user adds the device, called just after pairing.
   */
  async onAdded() {
    this.log('Whisper Flex device has been added');
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
    this.log('Whisper Flex device settings where changed');
  }

  /**
   * onRenamed is called when the user updates the device's name.
   * This method can be used this to synchronise the name to the device.
   * @param {string} name The new name
   */
  async onRenamed(name) {
    this.log('Whisper Flex device was renamed');
  }

  /**
   * onDeleted is called when the user deleted the device.
   */
  async onDeleted() {
    this.log('Whisper Flex device has been deleted');
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

        if (this.hasCapability('whisper_mode') && status.mode !== undefined) {
          let modeValue;
          if (status.mode === 0) {
            modeValue = "normal";
          } else if (status.mode === 1) {
            modeValue = "nature";
          } else if (status.mode === 2) {
            modeValue = "night";
          } else return;
          await this.setCapabilityValue('whisper_mode', modeValue).catch(err => {
            this.error('Error setting mode capability:', err);
          });
        }

        const isFirstRun = this.homey.settings.get('firstRun');

        const isHorizontalOscillation = status.swing === 1;
        this.setStoreValue('horizontal_oscillation', isHorizontalOscillation);
        if (this.hasCapability('horizontal_oscillation')) {
          if (isHorizontalOscillation !== this.getCapabilityValue('horizontal_oscillation')) {
            if (isFirstRun !== true) {
              if (this.getCapabilityValue('horizontal_oscillation') === true) {
                await this.driver.triggerFlow('horizontal_oscillation_disabled', this);
              } else if (this.getCapabilityValue('horizontal_oscillation') === false) {
                await this.driver.triggerFlow('horizontal_oscillation_disabled', this);
              }
            }
          }
          await this.setCapabilityValue('horizontal_oscillation', isHorizontalOscillation).catch(err => {
            this.error('Error setting horizontal_oscillation capability:', err);
          });
        }

        if (isFirstRun === true) {
          this.homey.settings.set('firstRun', false);
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