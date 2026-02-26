'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class Subscription extends Model {
    static associate(models) {
      Subscription.belongsTo(models.User, { foreignKey: 'user_id' });
      Subscription.belongsTo(models.Plan, { foreignKey: 'plan_id' });
    }
  }

  Subscription.init(
    {
      user_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      plan_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      started_at: {
        type: DataTypes.DATE,
        allowNull: false,
      },
      expires_at: {
        type: DataTypes.DATE,
        allowNull: false,
      },
      traffic_limit: {
        type: DataTypes.BIGINT,
        allowNull: false,
      },
      traffic_used: {
        type: DataTypes.BIGINT,
        allowNull: false,
        defaultValue: 0,
      },
      throttled: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      active: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
    },
    {
      sequelize,
      modelName: 'Subscription',
    },
  );

  return Subscription;
};