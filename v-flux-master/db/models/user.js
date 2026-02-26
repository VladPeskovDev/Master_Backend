'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class User extends Model {
    static associate(models) {
      User.hasMany(models.Subscription, { foreignKey: 'user_id' });
      User.hasMany(models.Payment, { foreignKey: 'user_id' });
      User.belongsTo(models.User, { as: 'referrer', foreignKey: 'referred_by' });
      User.hasMany(models.ReferralReward, { as: 'rewards', foreignKey: 'referrer_id' });
    }
  }

  User.init(
    {
      telegram_id: {
        type: DataTypes.BIGINT,
        allowNull: false,
        unique: true,
      },
      username: DataTypes.STRING,
      first_name: DataTypes.STRING,
      last_name: DataTypes.STRING,
      uuid: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
      },
      sub_token: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
      },
      lang: {
        type: DataTypes.STRING(5),
        allowNull: false,
        defaultValue: 'en',
      },
      region: DataTypes.STRING(5),
      referral_code: {
        type: DataTypes.STRING(10),
        allowNull: false,
        unique: true,
      },
      referred_by: DataTypes.INTEGER,
    },
    {
      sequelize,
      modelName: 'User',
    },
  );

  return User;
};