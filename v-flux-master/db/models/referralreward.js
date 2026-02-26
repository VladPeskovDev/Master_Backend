'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class ReferralReward extends Model {
    static associate(models) {
      ReferralReward.belongsTo(models.User, { as: 'referrer', foreignKey: 'referrer_id' });
      ReferralReward.belongsTo(models.User, { as: 'referred', foreignKey: 'referred_id' });
    }
  }

  ReferralReward.init(
    {
      referrer_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      referred_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        unique: true,
      },
      days_awarded: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 7,
      },
    },
    {
      sequelize,
      modelName: 'ReferralReward',
    },
  );

  return ReferralReward;
};