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

module.exports = class ThreesixtyDevice extends Homey.Device {

  /**
   * onInit is called when the device is initialized.
   */
  async onInit() {
    try {
      this.log('Threesixty device has been initialized');
      
      this.registerCapabilityListener("onoff", async (value) => {
        let command;
        if (value === true) {
          command = "tune set power 1";
        } else {
          command = "tune set power 0";
        }
        await this.sendCommand(command);
      });

      this.registerCapabilityListener("target_temperature", async (value) => {
        let command;
        command = `tune set sp ${value}`;
        await this.sendCommand(command);
      });

      this.registerCapabilityListener("heatmode", async (value) => {
        let command;
        if (value === "three") {
          command = "tune set mode 0";
        } else if (value === "two") {
          command = "tune set mode 1";
        } else if (value === "one") {
          command = "tune set mode 2";
        } else return;
        await this.sendCommand(command);
      });

      this.homey.settings.set('firstRun', true);

      this.startPolling();
    } catch (error) {
      this.error('Error during Threesixty device initialization:', error);
    }
  }

  /**
   * onAdded is called when the user adds the device, called just after pairing.
   */
  async onAdded() {
    this.log('Threesixty device has been added');

    const type = this.getStoreValue("deviceType");
    if (type === "21") {
      this.setCapabilityOptions("target_temperature",{
        min: 18,
        max: 30,
        step: 1
      });
    } else if (type === "50") {
      this.setCapabilityOptions("target_temperature",{
        min: 5,
        max: 30,
        step: 1
      });
    }
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
    this.log('Threesixty device settings where changed');
  }

  /**
   * onRenamed is called when the user updates the device's name.
   * This method can be used this to synchronise the name to the device.
   * @param {string} name The new name
   */
  async onRenamed(name) {
    this.log('Threesixty device was renamed');
  }

  /**
   * onDeleted is called when the user deleted the device.
   */
  async onDeleted() {
    this.log('Threesixty device has been deleted');
    this.stopPolling();
  }

  startPolling() {
    // Clear any existing interval
    this.stopPolling();
    
    // Poll immediately
    this.pollDeviceStatus();
    
    // Then poll every 10 seconds
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
        const isOn = status.power === 1;
        await this.setAvailable();
        if (this.hasCapability('onoff')) {
          await this.setCapabilityValue('onoff', isOn).catch(err => {
            this.error('Error setting onoff capability:', err);
          });
        }

        if (this.hasCapability('measure_temperature') && status.temp !== undefined) {
          await this.setCapabilityValue('measure_temperature', status.temp).catch(err => {
            this.error('Error setting temperature capability:', err);
          });
        }

        if (this.hasCapability('target_temperature') && status.sp !== undefined) {
          const setpoint = status.sp;
          await this.setCapabilityValue('target_temperature', setpoint).catch(err => {
            this.error('Error setting target temperature capability:', err);
          });
        }

        if (this.hasCapability('heatmode') && status.mode !== undefined) {
          let fanValue;
          if (status.mode === 0) {
            fanValue = "three";
          } else if (status.mode === 1) {
            fanValue = "two";
          } else if (status.mode === 2) {
            fanValue = "one";
          } else return;
          await this.setCapabilityValue('heatmode', fanValue).catch(err => {
            this.error('Error setting heatmode capability:', err);
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