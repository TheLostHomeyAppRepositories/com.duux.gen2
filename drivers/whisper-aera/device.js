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

module.exports = class WhisperAeraDevice extends Homey.Device {

  /**
   * onInit is called when the device is initialized.
   */
  async onInit() {
    try {
      this.log('Whisper Aera device has been initialized');
      
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

      this.registerCapabilityListener("whisper_mode_2", async (value) => {
        let command;
        if (value === "normal") {
          command = "tune set mode 0";
        } else if (value === "nature") {
          command = "tune set mode 1";
        } else return;
        await this.sendCommand(command);
      });

      this.registerCapabilityListener("horizontal_oscillation_aera", async (value) => {
        let command;
        if (value === "30") {
          command = "tune set horosc 1";
        } else if (value === "60") {
          command = "tune set horosc 2";
        } else if (value === "90") {
          command = "tune set horosc 3";
        } else if (value === "off") {
          command = "tune set horosc 0"
        } else return;
        await this.sendCommand(command);
      });

      this.registerCapabilityListener("vertical_oscillation2", async (value) => {
        let command;
        if (value === "45") {
          command = "tune set verosc 1";
        } else if (value === "100") {
          command = "tune set verosc 2";
        } else if (value === "off") {
          command = "tune set verosc 0"
        } else return;
        await this.sendCommand(command);
      });

      this.registerCapabilityListener("child_lock", async (value) => {
        let command;
        if (value === true) {
          command = "tune set lock 1";
        } else {
          command = "tune set lock 0";
        }
        await this.sendCommand(command);
      });

      this.registerCapabilityListener("night_mode", async (value) => {
        let command;
        if (value === true) {
          command = "tune set night 1";
        } else {
          command = "tune set night 0";
        }
        await this.sendCommand(command);
      });

      this.registerCapabilityListener("ionizer", async (value) => {
        let command;
        if (value === true) {
          command = "tune set ion 1";
        } else {
          command = "tune set ion 0";
        } 
        await this.sendCommand(command);
      });

      this.setStoreValue('firstRun', true);

      this.startPolling();

      const setHorizontalOscillationAction = this.homey.flow.getActionCard('set_horizontal_oscillation_aera');
      const setVerticalOscillationAction = this.homey.flow.getActionCard('set_vertical_oscillation_aera');
      const setModeAction = this.homey.flow.getActionCard('set_whisper_flex_2_mode_aera');
      const enableChildLockAction = this.homey.flow.getActionCard('enable_child_lock_whisper_aera');
      const disableChildLockAction = this.homey.flow.getActionCard('disable_child_lock_whisper_aera');
      const enableNightModeAction = this.homey.flow.getActionCard('enable_night_mode_whisper_aera');
      const disableNightModeAction = this.homey.flow.getActionCard('disable_night_mode_whisper_aera');
      const enableIonizerAction = this.homey.flow.getActionCard('enable_ionizer_aera');
      const disableIonizerAction = this.homey.flow.getActionCard('disable_ionizer_aera');
      const childLockCondition = this.homey.flow.getConditionCard('whisper_child_lock_condition_aera');
      const nightModeCondition = this.homey.flow.getConditionCard('whisper_night_mode_condition_aera');
      const ionizerCondition = this.homey.flow.getConditionCard('ionizer_condition_aera');


      setModeAction.registerRunListener(async (args, state) => {
        if (args.mode === 'normal') {
          await this.sendCommand("tune set mode 0");
        } else if (args.mode === 'nature') {
          await this.sendCommand("tune set mode 1");
        }
        return true;
      });

      setHorizontalOscillationAction.registerRunListener(async (args, state) => {
        if (args.mode === 'off') {
          await this.sendCommand("tune set horosc 0");
        } else if (args.mode === '30') {
          await this.sendCommand("tune set horosc 1");
        } else if (args.mode === '60') {
          await this.sendCommand("tune set horosc 2");
        } else if (args.mode === '90') {
          await this.sendCommand("tune set horosc 3");
        }
        return true;
      });

      setVerticalOscillationAction.registerRunListener(async (args, state) => {
        if (args.mode === 'off') {
          await this.sendCommand("tune set verosc 0");
        } else if (args.mode === '45') {
          await this.sendCommand("tune set verosc 1");
        } else if (args.mode === '100') {
          await this.sendCommand("tune set verosc 2");
        }
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

      enableIonizerAction.registerRunListener(async (args, state) => {
        await this.sendCommand("tune set ion 1");
        return true;
      });

      disableIonizerAction.registerRunListener(async (args, state) => {
        await this.sendCommand("tune set ion 0");
        return true;
      });

      childLockCondition.registerRunListener(async (args, state) => {
        const isChildLock = this.getCapabilityValue('child_lock');
        return isChildLock;
      });

      nightModeCondition.registerRunListener(async (args, state) => {
        const isNightMode = this.getCapabilityValue('night_mode');
        return isNightMode;
      });

      ionizerCondition.registerRunListener(async (args, state) => {
        const isIonizerOn = this.getCapabilityValue('ionizer');
        return isIonizerOn;
      });
    } catch (error) {
      this.error('Error during Whisper Flex 2 device initialization:', error);
    }
  }

  /**
   * onAdded is called when the user adds the device, called just after pairing.
   */
  async onAdded() {
    this.log('Whisper Flex 2 device has been added');
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
    this.log('Whisper Flex 2 device settings where changed');
  }

  /**
   * onRenamed is called when the user updates the device's name.
   * This method can be used this to synchronise the name to the device.
   * @param {string} name The new name
   */
  async onRenamed(name) {
    this.log('Whisper Flex 2 device was renamed');
  }

  /**
   * onDeleted is called when the user deleted the device.
   */
  async onDeleted() {
    this.log('Whisper Flex 2 device has been deleted');
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

        // Update battery capability
        if (this.hasCapability('measure_battery') && status.batlvl !== undefined) {
          const battery = status.batlvl;
          if (battery === 0) {
            await this.removeCapability('measure_battery');
          } else {
            await this.setCapabilityValue('measure_battery', battery*10).catch(err => {
              this.error('Error setting measure_battery capability:', err);
            });
          }
        }

        if (!this.hasCapability('measure_battery') && status.batlvl !== undefined && status.batlvl !== 0) {
          if (status.batlvl > 0) {
            await this.addCapability('measure_battery').catch(err => {
              this.error('Error adding measure_battery capability:', err);
            });
          }
        }

        // Log if device is in error state
        if (status.err && status.err !== 0) {
          this.error('Device reported error code:', status.err);
        }

        if (this.hasCapability('whisper_mode_2') && status.mode !== undefined) {
          let modeValue;
          if (status.mode === 0) {
            modeValue = "normal";
          } else if (status.mode === 1) {
            modeValue = "nature";
          } else return;
          await this.setCapabilityValue('whisper_mode_2', modeValue).catch(err => {
            this.error('Error setting mode capability:', err);
          });
        }

        if (this.hasCapability('horizontal_oscillation_aera') && status.horosc !== undefined) {
          let horizontalOscillationValue;
          if (status.horosc === 0) {
            horizontalOscillationValue = "off";
          } else if (status.horosc === 1) {
            horizontalOscillationValue = "30";
          } else if (status.horosc === 2) {
            horizontalOscillationValue = "60";
          } else if (status.horosc === 3) {
            horizontalOscillationValue = "90";
          } else return;
          await this.setCapabilityValue('horizontal_oscillation_aera', horizontalOscillationValue).catch(err => {
            this.error('Error setting horizontal_oscillation_aera capability:', err);
          });
        }

        if (this.hasCapability('vertical_oscillation2') && status.verosc !== undefined) {
          let verticalOscillationValue;
          if (status.verosc === 0) {
            verticalOscillationValue = "off";
          } else if (status.verosc === 1) {
            verticalOscillationValue = "45";
          } else if (status.verosc === 2) {
            verticalOscillationValue = "100";
          } else return;
          await this.setCapabilityValue('vertical_oscillation2', verticalOscillationValue).catch(err => {
            this.error('Error setting vertical_oscillation2 capability:', err);
          });
        }

        const isFirstRun = this.getStoreValue('firstRun');

        const isChildLock = status.lock === 1;
        this.setStoreValue('child_lock', isChildLock);
        if (this.hasCapability('child_lock')) {
          if (isChildLock !== this.getCapabilityValue('child_lock')) {
            if (isFirstRun !== true) {
              if (this.getCapabilityValue('child_lock') === true) {
                await this.driver.triggerFlow('child_lock_enabled_whisper_aera', this);
              } else if (this.getCapabilityValue('child_lock') === false) {
                await this.driver.triggerFlow('child_lock_enabled_whisper_aera', this);
              }
            }
          }
          await this.setCapabilityValue('child_lock', isChildLock).catch(err => {
            this.error('Error setting child_lock capability:', err);
          });
        }

        const isNightMode = status.night === 1;
        this.setStoreValue('night_mode', isNightMode);
        if (this.hasCapability('night_mode')) {
          if (isNightMode !== this.getCapabilityValue('night_mode')) {
            if (isFirstRun !== true) {
              if (this.getCapabilityValue('night_mode') === true) {
                await this.driver.triggerFlow('night_mode_enabled_whisper_aera', this);
              } else if (this.getCapabilityValue('night_mode') === false) {
                await this.driver.triggerFlow('night_mode_enabled_whisper_aera', this);
              }
            }
          }
          await this.setCapabilityValue('night_mode', isNightMode).catch(err => {
            this.error('Error setting night_mode capability:', err);
          });
        }

        const isIonizer = status.ion === 1;
        this.setStoreValue('ionizer', isIonizer);
        if (this.hasCapability('ionizer')) {
          if (isIonizer !== this.getCapabilityValue('ionizer')) {
            if (isFirstRun !== true) {
              if (this.getCapabilityValue('ionizer') === true) {
                await this.driver.triggerFlow('ionizer_enabled_aera', this);
              } else if (this.getCapabilityValue('ionizer') === false) {
                await this.driver.triggerFlow('ionizer_enabled_aera', this);
              }
            }
          }
          await this.setCapabilityValue('ionizer', isIonizer).catch(err => {
            this.error('Error setting ionizer capability:', err);
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