'use strict';

const Homey = require('homey');
const axios = require('axios');
const crypto = require('crypto');

module.exports = class Bright2Driver extends Homey.Driver {

  /**
   * onInit is called when the driver is initialized.
   */
  async onInit() {
    this.log('Bright 2 driver has been initialized');
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
    this.log('Bright2 pairing started');
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
    this.log('Bright 2 repairing started');
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
        .filter(device => device.type === "55")
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