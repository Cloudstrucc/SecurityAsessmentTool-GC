/**
 * Minimal SMS sender for per-tenant providers. Currently supports Twilio via
 * its REST API (no extra dependency — uses global fetch). Never throws; always
 * returns { sent, error?, sid? }.
 */
async function sendSms(settings, to, body) {
  if (!settings || !settings.sms_enabled) return { sent: false, error: 'SMS not enabled' };
  const provider = settings.sms_provider || 'twilio';
  if (provider !== 'twilio') return { sent: false, error: `Unsupported SMS provider: ${provider}` };
  if (!settings.sms_account_sid || !settings.sms_auth_token || !settings.sms_from) {
    return { sent: false, error: 'Twilio SID, token and from-number are required.' };
  }
  try {
    const url = `https://api.twilio.com/2010-04-01/Accounts/${settings.sms_account_sid}/Messages.json`;
    const auth = Buffer.from(`${settings.sms_account_sid}:${settings.sms_auth_token}`).toString('base64');
    const params = new URLSearchParams({ To: to, From: settings.sms_from, Body: body });
    const resp = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString()
    });
    if (!resp.ok) {
      const t = await resp.text();
      return { sent: false, error: `Twilio ${resp.status}: ${t.slice(0, 200)}` };
    }
    const data = await resp.json();
    return { sent: true, sid: data.sid };
  } catch (err) {
    return { sent: false, error: err.message };
  }
}

async function sendTestSms(settings, to) {
  return sendSms(settings, to, 'Vanguard SA&A — your SMS configuration works. This is a test message.');
}

module.exports = { sendSms, sendTestSms };
