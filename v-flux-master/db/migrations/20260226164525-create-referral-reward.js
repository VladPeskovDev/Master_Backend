'use strict';
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('ReferralRewards', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER,
      },
      referrer_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'Users',
          key: 'id',
        },
        onDelete: 'CASCADE',
      },
      referred_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        unique: true,
        references: {
          model: 'Users',
          key: 'id',
        },
        onDelete: 'CASCADE',
      },
      days_awarded: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 30,
      },
      traffic_awarded: {
        type: Sequelize.BIGINT,
        allowNull: false,
        defaultValue: 107374182400, // 100 GB
      },
      createdAt: {
        allowNull: false,
        type: Sequelize.DATE,
      },
      updatedAt: {
        allowNull: false,
        type: Sequelize.DATE,
      },
    });

    await queryInterface.addIndex('ReferralRewards', ['referrer_id']);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('ReferralRewards');
  },
};