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

module.exports = class BeamDevice extends Homey.Device {

  /**
   * onInit is called when the device is initialized.
   */
  async onInit() {
    try {
      this.log('Beam device has been initialized');
      
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

      this.registerCapabilityListener("night_mode", async (value) => {
        let command;
        if (value === true) {
          command = "tune set night 1";
        } else if (value === false) {
          command = "tune set night 0";
        } else return;
        await this.sendCommand(command);
      });

      this.registerCapabilityListener("led", async (value) => {
        let command;
        if (value === true) {
          command = "tune set led 1";
        } else if (value === false) {
          command = "tune set led 0";
        } else return;
        await this.sendCommand(command);
      });

      this.homey.settings.set('firstRun', true);

      // Start polling
      this.startPolling();

      const setFanSpeedAction = this.homey.flow.getActionCard('set_fan_speed_beam');
      const enableNightModeAction = this.homey.flow.getActionCard('enable_night_mode_beam');
      const disableNightModeAction = this.homey.flow.getActionCard('disable_night_mode_beam');
      const enableLightAction = this.homey.flow.getActionCard('turn_on_led');
      const disableLightAction = this.homey.flow.getActionCard('turn_off_led');
      const nightModeCondition = this.homey.flow.getConditionCard('night_mode_condition');
      const lightCondition = this.homey.flow.getConditionCard('led_condition');

      nightModeCondition.registerRunListener(async (args, state) => {
        const isNight = this.getCapabilityValue('night_mode');
        return isNight;
      });

      lightCondition.registerRunListener(async (args, state) => {
        const led = this.getCapabilityValue('led');
        return led;
      });

      enableNightModeAction.registerRunListener(async (args, state) => {
        await this.sendCommand("tune set night 1");
        return true;
      });

      disableNightModeAction.registerRunListener(async (args, state) => {
        await this.sendCommand("tune set night 0");
        return true;
      });

      enableLightAction.registerRunListener(async (args, state) => {
        await this.sendCommand("tune set led 1");
        return true;
      });

      disableLightAction.registerRunListener(async (args, state) => {
        await this.sendCommand("tune set led 0");
        return true;
      });


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
      this.error('Error during Beam device initialization:', error);
    }
  }

  /**
   * onAdded is called when the user adds the device, called just after pairing.
   */
  async onAdded() {
    this.log('Beam device has been added');
    try {
      const type = this.getStoreValue('type');
      await axios.post('https://device-support-requests.vercel.app/api/send-report', {
        message: 'Anonymous user: Beam device type ID',
        app: 'Duux Gen2',
        report: {
          type: type,
          device: "Beam"
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
    this.log('Beam device settings where changed');
  }

  /**
   * onRenamed is called when the user updates the device's name.
   * This method can be used this to synchronise the name to the device.
   * @param {string} name The new name
   */
  async onRenamed(name) {
    this.log('Beam device was renamed');
  }

  /**
   * onDeleted is called when the user deleted the device.
   */
  async onDeleted() {
    this.log('Beam device has been deleted');
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

        // Update humidity (if you have this capability)
        if (this.hasCapability('measure_humidity') && status.hum !== undefined) {
          await this.setCapabilityValue('measure_humidity', status.hum).catch(err => {
            this.error('Error setting humidity capability:', err);
          });
        }

        // Update target humidity setpoint (if you have this capability)
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

        const isNight = status.night === 1;
        this.setStoreValue('night_mode', isNight);
        if (this.hasCapability('night_mode') && status.night !== undefined) {
          if (isNight !== this.getCapabilityValue('night_mode')) {
            if (isFirstRun !== true) {
              if (this.getCapabilityValue('night_mode') === true) {
                await this.driver.triggerFlow('night_mode_disabled', this);
              } else if (this.getCapabilityValue('night_mode') === false) {
                await this.driver.triggerFlow('night_mode_enabled', this);
              }
            }
          }
          await this.setCapabilityValue('night_mode', isNight).catch(err => {
            this.error('Error setting night_mode capability:', err);
          });
        }

        const light = status.led === 1;
        this.setStoreValue('light', light);
        if (this.hasCapability('light') && status.led !== undefined) {
          if (light !== this.getCapabilityValue('light')) {
            if (isFirstRun !== true) {
              if (this.getCapabilityValue('light') === true) {
                await this.driver.triggerFlow('led_turned_off', this);
              } else if (this.getCapabilityValue('light') === false) {
                await this.driver.triggerFlow('light_turned_on', this);
              }
            }
          }
          await this.setCapabilityValue('light', light).catch(err => {
            this.error('Error setting light capability:', err);
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