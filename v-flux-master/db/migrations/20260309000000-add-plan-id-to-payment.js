'use strict';
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('Payments', 'plan_id', {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: {
        model: 'Plans',
        key: 'id',
      },
      onDelete: 'SET NULL',
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('Payments', 'plan_id');
  },
};
