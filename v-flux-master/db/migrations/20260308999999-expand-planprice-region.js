'use strict';
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.changeColumn('PlanPrices', 'region', {
      type: Sequelize.STRING(20),
      allowNull: false,
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.changeColumn('PlanPrices', 'region', {
      type: Sequelize.STRING(5),
      allowNull: false,
    });
  },
};
