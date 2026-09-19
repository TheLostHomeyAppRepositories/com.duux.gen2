'use strict';

const Homey = require('homey');
const axios = require('axios');
const crypto = require('crypto');

module.exports = class WhisperAeraDriver extends Homey.Driver {

  /**
   * onInit is called when the driver is initialized.
   */
  async onInit() {
    this.log('Whisper Aera driver has been initialized');
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
      const device = args.device;
      if (args.mode === 'normal') {
        await device.sendCommand("tune set mode 0");
      } else if (args.mode === 'nature') {
        await device.sendCommand("tune set mode 1");
      }
      return true;
    });

    setHorizontalOscillationAction.registerRunListener(async (args, state) => {
      const device = args.device;
      if (args.mode === 'off') {
        await device.sendCommand("tune set horosc 0");
      } else if (args.mode === '30') {
        await device.sendCommand("tune set horosc 1");
      } else if (args.mode === '60') {
        await device.sendCommand("tune set horosc 2");
      } else if (args.mode === '90') {
        await device.sendCommand("tune set horosc 3");
      }
      return true;
    });

    setVerticalOscillationAction.registerRunListener(async (args, state) => {
      const device = args.device;
      if (args.mode === 'off') {
        await device.sendCommand("tune set verosc 0");
      } else if (args.mode === '45') {
        await device.sendCommand("tune set verosc 1");
      } else if (args.mode === '100') {
        await device.sendCommand("tune set verosc 2");
      }
      return true;
    });

    enableChildLockAction.registerRunListener(async (args, state) => {
      const device = args.device;
      await device.sendCommand("tune set lock 1");
      return true;
    });

    disableChildLockAction.registerRunListener(async (args, state) => {
      const device = args.device;
      await device.sendCommand("tune set lock 0");
      return true;
    });

    enableNightModeAction.registerRunListener(async (args, state) => {
      const device = args.device;
      await device.sendCommand("tune set night 1");
      return true;
    });

    disableNightModeAction.registerRunListener(async (args, state) => {
      const device = args.device;
      await device.sendCommand("tune set night 0");
      return true;
    });

    enableIonizerAction.registerRunListener(async (args, state) => {
      const device = args.device;
      await device.sendCommand("tune set ion 1");
      return true;
    });

    disableIonizerAction.registerRunListener(async (args, state) => {
      const device = args.device;
      await device.sendCommand("tune set ion 0");
      return true;
    });

    childLockCondition.registerRunListener(async (args, state) => {
      const device = args.device;
      const isChildLock = device.getCapabilityValue('child_lock');
      return isChildLock;
    });

    nightModeCondition.registerRunListener(async (args, state) => {
      const device = args.device;
      const isNightMode = device.getCapabilityValue('night_mode');
      return isNightMode;
    });

    ionizerCondition.registerRunListener(async (args, state) => {
      const device = args.device;
      const isIonizerOn = device.getCapabilityValue('ionizer');
      return isIonizerOn;
    });
  }

  async triggerFlow(card_id, device) {
    this.homey.flow.getDeviceTriggerCard(card_id).trigger(device, {}, {});
  }

  generateCodeVerifier() {
    const buffer = crypto.randomBytes(64);
    return this.base64URLEncode(buffer);
  }

  generateCodeChallenge(verifier) {
    const hash = crypto.createHash('sha256').update(verifier).digest();
    return this.base64URLEncode(hash);
  }

  base64URLEncode(buffer) {
    return buffer.toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');
  }

  async onPair(session) {
    this.log('Whisper Aera pairing started');
    this._type = "pair";
    this._session = session;

    session.setHandler('showView', async (viewId) => {
      if (viewId === 'email') {
        const loggedIn = this.homey.settings.get('loggedIn');
        if (loggedIn) {
          await session.showView('list_devices');
          return;
        }
      }
    });
    
    session.setHandler('login', async (data) => {
      try {
        this.homey.settings.set('email', data.email);
        const codeVerifier = this.generateCodeVerifier();
        const codeChallenge = this.generateCodeChallenge(codeVerifier);
        this.homey.settings.set('verifier', codeVerifier);
        this.homey.settings.set('challenge', codeChallenge);
        this.log('Login with email:', data.email);

        const redirectUri = await this.registerWebhook(session);
        
        const response = await axios.post('https://v5.api.cloudgarden.nl/auth/passwordlessLogin/code', {
          email: data.email,
          clientId: '83f34a5fa5faca9023c78980a57a87b41f6972fc4ee45e9c',
          codeChallenge: codeChallenge,
          codeChallengeMethod: 'sha256',
          redirectUri: redirectUri,
          tenantId: 44
        });
        
        if (response.data && response.data.data === 'ok') {
          await session.showView('code');
        } else {
          return false;
        }
      } catch (error) {
        this.error('Login error:', error);
        return false;
      }
    });

    session.setHandler('code', async (data) => {
      return await this.homey.app.codeLogin(data, session, "pair");
    });

    session.setHandler("list_devices", async () => {
      try {
        return await this.onPairListDevices();
      } catch (error) {
        throw new Error("Error while fetching devices: " + error.message);
      }
    });
  }

  async registerWebhook(session) {
    try {
      const cloudId = await this.homey.cloud.getHomeyId();
      const id = Homey.env.WEBHOOK_ID;
      const secret = Homey.env.WEBHOOK_SECRET;
      const authWebhook = await this.homey.cloud.createWebhook(id, secret, {});
      authWebhook.on('message', async args => {
        try {
        this.log('Got a webhook message!');
        this.log('headers:', args.headers);
        this.log('query:', args.query);
        this.log('body:', args.body);
        await this.homey.app.codeLogin({ code: args.query.code }, this._session, this._type);
        } catch (error) {
          this.error('Error handling webhook message:', error);
        }
      });
      return `https://smarthomesven.github.io/homey-duux-gen2-auth/#/${cloudId}`;
    } catch (error) {
      this.error('Error registering webhook:', error);
    }
  }

  async onRepair(session) {
    this.log('Whisper Aera repairing started');
    this._type = "repair";
    this._session = session;
    
    session.setHandler('login', async (data) => {
      try {
        this.homey.settings.set('email', data.email);
        const codeVerifier = this.generateCodeVerifier();
        const codeChallenge = this.generateCodeChallenge(codeVerifier);
        this.homey.settings.set('verifier', codeVerifier);
        this.homey.settings.set('challenge', codeChallenge);
        this.log('Login with email:', data.email);

        const redirectUri = await this.registerWebhook(this._session);
        
        const response = await axios.post('https://v5.api.cloudgarden.nl/auth/passwordlessLogin/code', {
          email: data.email,
          clientId: '83f34a5fa5faca9023c78980a57a87b41f6972fc4ee45e9c',
          codeChallenge: codeChallenge,
          codeChallengeMethod: 'sha256',
          redirectUri: redirectUri,
          tenantId: 44
        });
        
        if (response.data && response.data.data === 'ok') {
          await session.showView('code');
        } else {
          return false;
        }
      } catch (error) {
        this.error('Login error:', error);
        return false;
      }
    });

    session.setHandler('code', async (data) => {
      return await this.homey.app.codeLogin(data, session, "repair");
    });
  }

  /**
   * onPairListDevices is called when a user is adding a device
   * and the 'list_devices' view is called.
   * This should return an array with the data of devices that are available for pairing.
   */
  async onPairListDevices() {
    try {
      const accessToken = this.homey.settings.get('accessToken');
      if (!accessToken) {
        throw new Error('Not logged in');
      }

      const tenantsResponse = await axios.get('https://v5.api.cloudgarden.nl/tenant/?tenantQueryType=1&issuesOnly=false&sortDescendent=false&skip=0&take=25&returnModel=2', {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      });

      const tenants = tenantsResponse.data.data;    
      const userTenants = tenants.filter(tenant => tenant.parentTenantId !== null); 
      const allDevices = [];
      for (const tenant of userTenants) {
        try {
          const devicesResponse = await axios.get(`https://v5.api.cloudgarden.nl/sensor/?tenantId=${tenant.id}&returnModel=2&skip=0&take=25`, {
            headers: {
              'Authorization': `Bearer ${accessToken}`
            }
          });
          
          const devicesWithTenant = devicesResponse.data.data.map(device => ({
            ...device,
            tenantId: tenant.id,
            tenantName: tenant.name
          }));
          
          allDevices.push(...devicesWithTenant);
        } catch (error) {
          this.error(`Error fetching devices for tenant ${tenant.id}:`, error.message);
        }
      }

      const availableDevices = allDevices
        .filter(device => device.type === "60")
        .map(device => ({
          name: device.displayName,
          data: {
            id: device.id
          },
          store: {
            id: device.id,
            mac: device.deviceId,
            tenantId: device.tenantId,
            spaceId: device.spaceId,
            type: device.type
          }
        }));

      return availableDevices;
    } catch (error) {
      this.error('Error in onPairListDevices:', error.message);
    }
  }

};