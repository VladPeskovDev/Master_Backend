'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class Node extends Model {
    static associate(models) {
      // нет связей
    }
  }

  Node.init(
    {
      name: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      host: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      port: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 8080,
      },
      token: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      domain: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      location: DataTypes.STRING,
      max_users: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 250,
      },
      bandwidth_mbps: {
        type: DataTypes.INTEGER,
        defaultValue: 1000,
      },
      active: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
      last_health_at: DataTypes.DATE,
    },
    {
      sequelize,
      modelName: 'Node',
    },
  );

  return Node;
};