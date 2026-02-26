const axios = require('axios');

const createNodeApi = (host, port, token) => {
  return axios.create({
    baseURL: `http://${host}:${port}`,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    timeout: 10000,
  });
};

module.exports = createNodeApi;