'use strict';
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('Users', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER,
      },
      telegram_id: {
        type: Sequelize.BIGINT,
        allowNull: false,
        unique: true,
      },
      username: {
        type: Sequelize.STRING,
      },
      first_name: {
        type: Sequelize.STRING,
      },
      last_name: {
        type: Sequelize.STRING,
      },
      uuid: {
        type: Sequelize.STRING,
        allowNull: false,
        unique: true,
      },
      sub_token: {
        type: Sequelize.STRING,
        allowNull: false,
        unique: true,
      },
      lang: {
        type: Sequelize.STRING(5),
        allowNull: false,
        defaultValue: 'en',
      },
      region: {
        type: Sequelize.STRING(5),
      },
      referral_code: {
        type: Sequelize.STRING(10),
        allowNull: false,
        unique: true,
      },
      referred_by: {
        type: Sequelize.INTEGER,
        references: {
          model: 'Users',
          key: 'id',
        },
        onDelete: 'SET NULL',
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

    await queryInterface.addIndex('Users', ['telegram_id']);
    await queryInterface.addIndex('Users', ['uuid']);
    await queryInterface.addIndex('Users', ['sub_token']);
    await queryInterface.addIndex('Users', ['referral_code']);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('Users');
  },
};