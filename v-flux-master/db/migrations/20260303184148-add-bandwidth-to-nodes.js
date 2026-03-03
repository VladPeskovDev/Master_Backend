'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('Nodes', 'bandwidth_mbps', {
      type: Sequelize.INTEGER,
      defaultValue: 1000,
    });
  },
  down: async (queryInterface) => {
    await queryInterface.removeColumn('Nodes', 'bandwidth_mbps');
  },
};
