'use strict';

const Homey = require('homey');
const axios = require('axios');
const https = require('https');
const CacheableLookup = require('cacheable-lookup');
const cacheable = new CacheableLookup({
  maxTtl: 300,
});
const httpsAgent = new https.Agent({
  keepAlive: true,
  keepAliveMsecs: 10000,
  maxSockets: 10,
  maxFreeSockets: 4,
  timeout: 30000,
});
cacheable.install(httpsAgent);
const apiClient = axios.create({
  baseURL: 'https://v5.api.cloudgarden.nl',
  httpsAgent,
  timeout: 10000,
});

module.exports = class Bright2Device extends Homey.Device {

  /**
   * onInit is called when the device is initialized.
   */
  async onInit() {
    try {
      this.log('Bright 2 device has been initialized');
      
      this.registerCapabilityListener("onoff", async (value) => {
        let command;
        if (value === true) {
          command = "tune set power 1";
        } else {
          command = "tune set power 0";
        }
        await this.sendCommand(command);
      });

      this.registerCapabilityListener("fan_speed_bright2", async (value) => {
        if (value === "auto") {
          await this.sendCommand("tune set speed 4");
        } else if (value === "low") {
          await this.sendCommand(`tune set speed 1`);
        } else if (value === "medium") {
          await this.sendCommand(`tune set speed 2`);
        } else if (value === "high") {
          await this.sendCommand(`tune set speed 3`);
        } else return;
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

      this.registerCapabilityListener("ionizer", async (value) => {
        let command;
        if (value === true) {
          command = "tune set ion 1";
        } else if (value === false) {
          command = "tune set ion 0";
        } else return;
        await this.sendCommand(command);
      });

      this.setStoreValue('firstRun', true);
      this.startPolling();

      const enableNightModeAction = this.homey.flow.getActionCard('enable_night_mode_bright2');
      const disableNightModeAction = this.homey.flow.getActionCard('disable_night_mode_bright2');
      const enableIonizerAction = this.homey.flow.getActionCard('enable_ionizer_bright2');
      const disableIonizerAction = this.homey.flow.getActionCard('disable_ionizer_bright2');
      const setFanSpeedAction = this.homey.flow.getActionCard('set_fan_speed_bright2');
      const nightModeCondition = this.homey.flow.getConditionCard('night_mode_condition_bright2');
      const ionizerCondition = this.homey.flow.getConditionCard('ionizer_condition_bright2');

      nightModeCondition.registerRunListener(async (args, state) => {
        const isNight = this.getCapabilityValue('night_mode');
        return isNight;
      });

      ionizerCondition.registerRunListener(async (args, state) => {
        const isIonizerOn = this.getCapabilityValue('ionizer');
        return isIonizerOn;
      });

      setFanSpeedAction.registerRunListener(async (args, state) => {
        let command;
        if (args.fan_speed === "auto") {
          command = "tune set speed 4";
        } else if (args.fan_speed === "low") {
          command = "tune set speed 1";
        } else if (args.fan_speed === "medium") {
          command = "tune set speed 2";
        } else if (args.fan_speed === "high") {
          command = "tune set speed 3";
        } else return;
        await this.sendCommand(command);
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

      enableIonizerAction.registerRunListener(async (args, state) => {
        await this.sendCommand("tune set ion 1");
        return true;
      });

      disableIonizerAction.registerRunListener(async (args, state) => {
        await this.sendCommand("tune set ion 0");
        return true;
      });
    } catch (error) {
      this.error('Error during Bright 2 device initialization:', error);
    }
  }

  /**
   * onAdded is called when the user adds the device, called just after pairing.
   */
  async onAdded() {
    this.log('Bright 2 device has been added');
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
    this.log('Bright 2 device settings where changed');
  }

  /**
   * onRenamed is called when the user updates the device's name.
   * This method can be used this to synchronise the name to the device.
   * @param {string} name The new name
   */
  async onRenamed(name) {
    this.log('Bright 2 device was renamed');
  }

  /**
   * onDeleted is called when the user deleted the device.
   */
  async onDeleted() {
    this.log('Bright 2 device has been deleted');
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

        if (this.hasCapability('measure_tvoc') && status.tvoc !== undefined) {
          await this.setCapabilityValue('measure_tvoc', status.tvoc).catch(err => {
            this.error('Error setting TVOC capability:', err);
          });
        }

        if (this.hasCapability('measure_pm25') && status.ppm !== undefined) {
          await this.setCapabilityValue('measure_pm25', status.ppm).catch(err => {
            this.error('Error setting PM2.5 capability:', err);
          });
        }

        if (status.err && status.err !== 0) {
          this.error('Device reported error code:', status.err);
        }

        if (this.hasCapability('fan_speed_bright2') && status.mode !== undefined && status.speed !== undefined) {
          let fanValue;
          if (status.speed === 4) {
            fanValue = "auto";
          } else if (status.speed === 1) {
            fanValue = "low";
          } else if (status.speed === 2) {
            fanValue = "medium";
          } else if (status.speed === 3) {
            fanValue = "high";
          } else return;
          await this.setCapabilityValue('fan_speed_bright2', fanValue).catch(err => {
            this.error('Error setting fan_speed_bright2 capability:', err);
          });
        }

        const isFirstRun = this.getStoreValue('firstRun');

        const isNight = status.night === 1;
        if (this.hasCapability('night_mode')) {
          if (isNight !== this.getCapabilityValue('night_mode')) {
            if (isFirstRun !== true) {
              if (this.getCapabilityValue('night_mode') === true) {
                await this.driver.triggerFlow('night_mode_disabled_bright2', this);
              } else if (this.getCapabilityValue('night_mode') === false) {
                await this.driver.triggerFlow('night_mode_enabled_bright2', this);
              }
            }
          }
          await this.setCapabilityValue('night_mode', isNight).catch(err => {
            this.error('Error setting night_mode capability:', err);
          });
        }

        if (isFirstRun === true) {
          this.setStoreValue('firstRun', false);
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