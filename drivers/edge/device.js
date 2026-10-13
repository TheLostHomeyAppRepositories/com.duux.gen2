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

module.exports = class EdgeDevice extends Homey.Device {

  /**
   * onInit is called when the device is initialized.
   */
  async onInit() {
    try {
      this.log('Edge device has been initialized');
      
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

      this.registerCapabilityListener("child_lock", async (value) => {
        let command;
        if (value === true) {
          command = "tune set lock 1";
        } else if (value === false) {
          command = "tune set lock 0";
        } else return;
        await this.sendCommand(command);
      });

      this.registerCapabilityListener("eco_mode", async (value) => {
        let command;
        if (value === true) {
          command = "tune set eco 1";
        } else if (value === false) {
          command = "tune set eco 0";
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

      const enableEcoModeAction = this.homey.flow.getActionCard('enable_eco_mode');
      const disableEcoModeAction = this.homey.flow.getActionCard('disable_eco_mode');
      const enableChildLockAction = this.homey.flow.getActionCard('enable_child_lock_edge');
      const disableChildLockAction = this.homey.flow.getActionCard('disable_child_lock_edge');
      const enableNightModeAction = this.homey.flow.getActionCard('enable_night_mode_edge');
      const disableNightModeAction = this.homey.flow.getActionCard('disable_night_mode_edge');
      const childLockCondition = this.homey.flow.getConditionCard('child_lock_condition_edge');
      const ecoModeCondition = this.homey.flow.getConditionCard('eco_mode_condition');
      const nightModeCondition = this.homey.flow.getConditionCard('night_mode_condition');

      childLockCondition.registerRunListener(async (args, state) => {
        const isLocked = this.getCapabilityValue('child_lock');
        return isLocked;
      });

      ecoModeCondition.registerRunListener(async (args, state) => {
        const isEco = this.getCapabilityValue('eco_mode');
        return isEco;
      });

      nightModeCondition.registerRunListener(async (args, state) => {
        const isNight = this.getCapabilityValue('night_mode');
        return isNight;
      });

      enableEcoModeAction.registerRunListener(async (args, state) => {
        await this.sendCommand("tune set eco 1");
        return true;
      });

      disableEcoModeAction.registerRunListener(async (args, state) => {
        await this.sendCommand("tune set eco 0");
        return true;
      });

      enableChildLockAction.registerRunListener(async (args, state) => {
        await this.sendCommand("tune set lock 1");
        return true;
      });

      disableChildLockAction.registerRunListener(async (args, state) => {
        await this.sendCommand("tune set lock 0");
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
      this.error('Error during Edge device initialization:', error);
    }
  }

  /**
   * onAdded is called when the user adds the device, called just after pairing.
   */
  async onAdded() {
    this.log('Edge device has been added');
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
    this.log('Edge device settings where changed');
  }

  /**
   * onRenamed is called when the user updates the device's name.
   * This method can be used this to synchronise the name to the device.
   * @param {string} name The new name
   */
  async onRenamed(name) {
    this.log('Edge device was renamed');
  }

  /**
   * onDeleted is called when the user deleted the device.
   */
  async onDeleted() {
    this.log('Edge device has been deleted');
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
        const isOn = status.power === 1;
        await this.setAvailable();
        if (this.hasCapability('onoff')) {
          await this.setCapabilityValue('onoff', isOn).catch(err => {
            this.error('Error setting onoff capability:', err);
          });
        }

        if (this.hasCapability('measure_temperature') && status.temp !== undefined) {
          await this.setCapabilityValue('measure_temperature', status.temp).catch(err => {
            this.error('Error setting measure_temperature capability:', err);
          });
        }

        if (this.hasCapability('target_temperature') && status.sp !== undefined) {
          const setpoint = status.sp;
          await this.setCapabilityValue('target_temperature', setpoint).catch(err => {
            this.error('Error setting target_temperature capability:', err);
          });
        }

        if (status.err && status.err !== 0) {
          this.error('Device reported error code:', status.err);
        }

        const isFirstRun = this.homey.settings.get('firstRun');

        const isLocked = status.lock === 1;
        if (this.hasCapability('child_lock')) {
          if (isLocked !== this.getCapabilityValue('child_lock')) {
            if (isFirstRun !== true) {
              if (this.getCapabilityValue('child_lock') === true) {
                await this.driver.triggerFlow('child_lock_disabled_edge', this);
              } else if (this.getCapabilityValue('child_lock') === false) {
                await this.driver.triggerFlow('child_lock_enabled_edge', this);
              }
            }
          }
          await this.setCapabilityValue('child_lock', isLocked).catch(err => {
            this.error('Error setting child_lock capability:', err);
          });
        }

        const isEco = status.eco === 1;
        if (this.hasCapability('eco_mode')) {
          if (isEco !== this.getCapabilityValue('eco_mode')) {
            if (isFirstRun !== true) {
              if (this.getCapabilityValue('eco_mode') === true) {
                await this.driver.triggerFlow('eco_mode_disabled', this);
              } else if (this.getCapabilityValue('eco_mode') === false) {
                await this.driver.triggerFlow('eco_mode_disabled', this);
              }
            }
          }
          await this.setCapabilityValue('eco_mode', isEco).catch(err => {
            this.error('Error setting eco_mode capability:', err);
          });
        }

        const isNight = status.night === 1;
        if (this.hasCapability('night_mode')) {
          if (isNight !== this.getCapabilityValue('night_mode')) {
            if (isFirstRun !== true) {
              if (this.getCapabilityValue('night_mode') === true) {
                await this.driver.triggerFlow('night_mode_disabled_edge', this);
              } else if (this.getCapabilityValue('night_mode') === false) {
                await this.driver.triggerFlow('night_mode_enabled_edge', this);
              }
            }
          }
          await this.setCapabilityValue('night_mode', isNight).catch(err => {
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