const { Node } = require('../../db/models');

const nodeIpWhitelist = async (req, res, next) => {
  try {
    const nodes = await Node.findAll({ attributes: ['host'] });
    const allowedIps = nodes.map((n) => n.host);

    const clientIp = (req.ip || '').replace(/^::ffff:/, '');

    if (!allowedIps.includes(clientIp)) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    next();
  } catch (err) {
    console.error('IP whitelist error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

const adminIpWhitelist = (req, res, next) => {
  const allowed = (process.env.ADMIN_ALLOWED_IPS || '').split(',').map((ip) => ip.trim()).filter(Boolean);

  if (allowed.length === 0) return next();

  const clientIp = (req.ip || '').replace(/^::ffff:/, '');

  // console.log('Admin IP check:', { clientIp, allowed });

  if (!allowed.includes(clientIp)) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  next();
};

module.exports = { nodeIpWhitelist, adminIpWhitelist };
