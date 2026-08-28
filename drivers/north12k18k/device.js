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

module.exports = class NorthDevice extends Homey.Device {

  /**
   * onInit is called when the device is initialized.
   */
  async onInit() {
    try {
      this.log('North device has been initialized');
      
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

      this.registerCapabilityListener("north_mode", async (value) => {
        let command;
        if (value === "cool") {
          command = "tune set mode 1";
        } else if (value === "dehumidify") {
          command = "tune set mode 3";
        } else if (value === "ventilate") {
          command = "tune set mode 4";
        } else return;
        await this.sendCommand(command);
      });

      this.registerCapabilityListener("heatmode", async (value) => {
        let command;
        if (value === "three") {
          command = "tune set fan 3";
        } else if (value === "two") {
          command = "tune set fan 2";
        } else if (value === "one") {
          command = "tune set fan 1";
        } else return;
        await this.sendCommand(command);
      });

      this.registerCapabilityListener("louver", async (value) => {
        let command;
        if (value === true) {
          command = "tune set tilt 1";
        } else if (value === false) {
          command = "tune set tilt 0";
        } else return;
        await this.sendCommand(command);
      });

      this.registerCapabilityListener("night_mode", async (value) => {
        let command;
        if (value === true) {
          command = "tune set night 1";
        } else if (value === false) {
          command = "tune set night 0";
        } else return;
        await this.sendCommand(command);
      });

      this.homey.settings.set('firstRun', true);

      this.startPolling();

      const enableNightModeAction = this.homey.flow.getActionCard('enable_night_mode_north');
      const disableNightModeAction = this.homey.flow.getActionCard('disable_night_mode_north');
      const setModeAction = this.homey.flow.getActionCard('set_mode_north');
      const setFanSpeedAction = this.homey.flow.getActionCard('set_fan_speed_north');
      const nightModeCondition = this.homey.flow.getConditionCard('night_mode_condition_north');

      nightModeCondition.registerRunListener(async (args, state) => {
        const isNight = this.getCapabilityValue('night_mode');
        return isNight;
      });

      setModeAction.registerRunListener(async (args, state) => {
        if (args.mode === 'cool') {
          await this.sendCommand("tune set mode 1");
        } else if (args.mode === 'dehumidify') {
          await this.sendCommand("tune set mode 3");
        } else if (args.mode === 'ventilate') {
          await this.sendCommand("tune set mode 4");
        }
        return true;
      });

      setFanSpeedAction.registerRunListener(async (args, state) => {
        if (args.speed === 'high') {
          await this.sendCommand("tune set fan 3");
        } else if (args.speed === 'medium') {
          await this.sendCommand("tune set fan 2");
        } else if (args.speed === 'low') {
          await this.sendCommand("tune set fan 1");
        }
        return true;
      });

      enableNightModeAction.registerRunListener(async (args, state) => {
        await this.sendCommand("tune set night 1");
        return true;
      });

      disableNightModeAction.registerRunListener(async (args, state) => {
        await this.sendCommand("tune set night 0");
        return true;
      });
    } catch (error) {
      this.error('Error during North device initialization:', error);
    }
  }

  /**
   * onAdded is called when the user adds the device, called just after pairing.
   */
  async onAdded() {
    this.log('North device has been added');
    try {
      const type = this.getStoreValue('type');
      await axios.post('https://device-support-requests.vercel.app/api/send-report', {
        message: 'Anonymous user: North 12k-18k device type ID',
        app: 'Duux Gen2',
        report: {
          type: type,
          device: "North 12k-18k"
        }
      });
    } catch (error) {
      this.error('Error sending device added report:', error);
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
    this.log('North device settings where changed');
  }

  /**
   * onRenamed is called when the user updates the device's name.
   * This method can be used this to synchronise the name to the device.
   * @param {string} name The new name
   */
  async onRenamed(name) {
    this.log('North device was renamed');
  }

  /**
   * onDeleted is called when the user deleted the device.
   */
  async onDeleted() {
    this.log('North device has been deleted');
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
        await this.setAvailable();
        // Update onoff capability (0=off, 1=on)
        const isOn = status.power === 1;
        if (this.hasCapability('onoff')) {
          await this.setCapabilityValue('onoff', isOn).catch(err => {
            this.error('Error setting onoff capability:', err);
          });
        }

        // Update temp
        if (this.hasCapability('measure_temperature') && status.temp !== undefined) {
          await this.setCapabilityValue('measure_temperature', status.temp).catch(err => {
            this.error('Error setting measure_temperature capability:', err);
          });
        }

        // Update setpoint
        if (this.hasCapability('target_temperature') && status.sp !== undefined) {
          const setpoint = status.sp;
          await this.setCapabilityValue('target_temperature', setpoint).catch(err => {
            this.error('Error setting target_temperature capability:', err);
          });
        }

        // Log if device is in error state
        if (status.err && status.err !== 0) {
          this.error('Device reported error code:', status.err);
        }

        if (this.hasCapability('north_mode') && status.mode !== undefined) {
          let modeValue;
          if (status.mode === 1) {
            modeValue = "cool";
          } else if (status.mode === 3) {
            modeValue = "dehumidify";
          } else if (status.mode === 4) {
            modeValue = "ventilate";
          } else return;
          await this.setCapabilityValue('north_mode', modeValue).catch(err => {
            this.error('Error setting north_mode capability:', err);
          });
        }

        if (this.hasCapability('heatmode') && status.fan !== undefined) {
          let fanValue;
          if (status.fan === 1) {
            fanValue = "one";
          } else if (status.fan === 2) {
            fanValue = "two";
          } else if (status.fan === 3) {
            fanValue = "three";
          } else return;
          await this.setCapabilityValue('heatmode', fanValue).catch(err => {
            this.error('Error setting heatmode capability:', err);
          });
        }

        const isFirstRun = this.homey.settings.get('firstRun');

        const isNight = status.night === 1;
        this.setStoreValue('night_mode', isNight);
        if (this.hasCapability('night_mode')) {
          if (isLocked !== this.getCapabilityValue('night_mode')) {
            if (isFirstRun !== true) {
              if (this.getCapabilityValue('night_mode') === true) {
                await this.driver.triggerFlow('night_mode_disabled_north', this);
              } else if (this.getCapabilityValue('night_mode') === false) {
                await this.driver.triggerFlow('night_mode_enabled_north', this);
              }
            }
          }
          await this.setCapabilityValue('night_mode', isLocked).catch(err => {
            this.error('Error setting night_mode capability:', err);
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