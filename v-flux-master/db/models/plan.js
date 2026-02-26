'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class Plan extends Model {
    static associate(models) {
      Plan.hasMany(models.Subscription, { foreignKey: 'plan_id' });
      Plan.hasMany(models.PlanPrice, { foreignKey: 'plan_id' });
    }
  }

  Plan.init(
    {
      name: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
      },
      duration_days: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      traffic_limit_bytes: {
        type: DataTypes.BIGINT,
        allowNull: false,
      },
      is_trial: {
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
      modelName: 'Plan',
    },
  );

  return Plan;
};