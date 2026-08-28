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

module.exports = class BeamMiniDevice extends Homey.Device {

  /**
   * onInit is called when the device is initialized.
   */
  async onInit() {
    try {
      this.log('Beam Mini device has been initialized');
      
      this.registerCapabilityListener("onoff", async (value) => {
        let command;
        if (value === true) {
          command = "tune set power 1";
        } else {
          command = "tune set power 0";
        }
        await this.sendCommand(command);
      });

      this.registerCapabilityListener("target_humidity", async (value) => {
        let command;
        command = `tune set sp ${Math.round(value * 100)}`;
        await this.sendCommand(command);
      });

      this.registerCapabilityListener("fan_speed_neo", async (value) => {
        if (value === "auto") {
          await this.sendCommand("tune set mode 1");
        } else if (value === "low") {
          await this.sendCommand(`tune set mode 0`);
          await this.sendCommand(`tune set speed 0`);
        } else if (value === "medium") {
          await this.sendCommand(`tune set mode 0`);
          await this.sendCommand(`tune set speed 1`);
        } else if (value === "high") {
          await this.sendCommand(`tune set mode 0`);
          await this.sendCommand(`tune set speed 2`);
        } else return;
      });

      this.homey.settings.set('firstRun', true);

      this.startPolling();

      const setFanSpeedAction = this.homey.flow.getActionCard('set_fan_speed_beam_mini');

      setFanSpeedAction.registerRunListener(async (args, state) => {
        if (args.speed === "auto") {
          await this.sendCommand("tune set mode 1");
        } else if (args.speed === "low") {
          await this.sendCommand(`tune set mode 0`);
          await this.sendCommand(`tune set speed 0`);
        } else if (args.speed === "medium") {
          await this.sendCommand(`tune set mode 0`);
          await this.sendCommand(`tune set speed 1`);
        } else if (args.speed === "high") {
          await this.sendCommand(`tune set mode 0`);
          await this.sendCommand(`tune set speed 2`);
        }
        return true;
      });
    } catch (error) {
      this.error('Error during Beam Mini device initialization:', error);
    }
  }

  /**
   * onAdded is called when the user adds the device, called just after pairing.
   */
  async onAdded() {
    this.log('Beam Mini device has been added');
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
    this.log('Beam Mini device settings where changed');
  }

  /**
   * onRenamed is called when the user updates the device's name.
   * This method can be used this to synchronise the name to the device.
   * @param {string} name The new name
   */
  async onRenamed(name) {
    this.log('Beam Mini device was renamed');
  }

  /**
   * onDeleted is called when the user deleted the device.
   */
  async onDeleted() {
    this.log('Beam Mini device has been deleted');
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
        // Update onoff capability (0=off, 1=on)
        await this.setAvailable();
        const isOn = status.power === 1;
        if (this.hasCapability('onoff')) {
          await this.setCapabilityValue('onoff', isOn).catch(err => {
            this.error('Error setting onoff capability:', err);
          });
        }

        if (this.hasCapability('measure_temperature') && status.temp !== undefined) {
          const temperatureC = status.temp;
          await this.setCapabilityValue('measure_temperature', temperatureC).catch(err => {
            this.error('Error setting measure_temperature capability:', err);
          });
        }

        if (this.hasCapability('measure_humidity') && status.hum !== undefined) {
          await this.setCapabilityValue('measure_humidity', status.hum).catch(err => {
            this.error('Error setting humidity capability:', err);
          });
        }

        if (this.hasCapability('target_humidity') && status.sp !== undefined) {
          const setpoint = status.sp / 100;
          await this.setCapabilityValue('target_humidity', setpoint).catch(err => {
            this.error('Error setting target humidity capability:', err);
          });
        }

        // Log if device is in error state
        if (status.err && status.err !== 0) {
          this.error('Device reported error code:', status.err);
        }

        if (this.hasCapability('fan_speed_neo') && status.mode !== undefined && status.speed !== undefined) {
          let fanValue;
          if (status.mode === 1) {
            fanValue = "auto";
          } else if (status.speed === 0) {
            fanValue = "low";
          } else if (status.speed === 1) {
            fanValue = "medium";
          } else if (status.speed === 2) {
            fanValue = "high";
          } else return;
          await this.setCapabilityValue('fan_speed_neo', fanValue).catch(err => {
            this.error('Error setting fan_speed_neo capability:', err);
          });
        }

        const isFirstRun = this.homey.settings.get('firstRun');

        if (isFirstRun === true) {
          this.homey.settings.set('firstRun', false);
        }

        this.log('Status updated successfully');
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