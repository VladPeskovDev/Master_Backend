'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class PlanPrice extends Model {
    static associate(models) {
      PlanPrice.belongsTo(models.Plan, { foreignKey: 'plan_id' });
    }
  }

  PlanPrice.init(
    {
      plan_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      region: {
        type: DataTypes.STRING(5),
        allowNull: false,
      },
      price: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      currency: {
        type: DataTypes.STRING(3),
        allowNull: false,
      },
    },
    {
      sequelize,
      modelName: 'PlanPrice',
      indexes: [{ unique: true, fields: ['plan_id', 'region'] }],
    },
  );

  return PlanPrice;
};