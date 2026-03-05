'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const plans = await queryInterface.bulkInsert(
      'Plans',
      [
        {
          name: 'Trial',
          duration_days: 3,
          traffic_limit_bytes: 5368709120, // 5 GB
          is_trial: true,
          active: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          name: 'Monthly',
          duration_days: 30,
          traffic_limit_bytes: 107374182400, // 100 GB
          is_trial: false,
          active: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          name: 'Semi-Annual',
          duration_days: 180,
          traffic_limit_bytes: 644245094400, // 600 GB
          is_trial: false,
          active: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          name: 'Annual',
          duration_days: 365,
          traffic_limit_bytes: 1288490188800, // 1200 GB
          is_trial: false,
          active: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
      { returning: true },
    );

    const monthly = plans.find((p) => p.name === 'Monthly');
    const semi = plans.find((p) => p.name === 'Semi-Annual');
    const annual = plans.find((p) => p.name === 'Annual');

    // PlanPrices
    await queryInterface.bulkInsert('PlanPrices', [
      // Monthly
      { plan_id: monthly.id, region: 'ru', price: 120, currency: 'RUB', createdAt: new Date(), updatedAt: new Date() },
      { plan_id: monthly.id, region: 'uae', price: 4, currency: 'USD', createdAt: new Date(), updatedAt: new Date() },
      { plan_id: monthly.id, region: 'tr', price: 2, currency: 'USD', createdAt: new Date(), updatedAt: new Date() },
      { plan_id: monthly.id, region: 'uz', price: 30000, currency: 'UZS', createdAt: new Date(), updatedAt: new Date() },
      // Semi-Annual
      { plan_id: semi.id, region: 'ru', price: 600, currency: 'RUB', createdAt: new Date(), updatedAt: new Date() },
      { plan_id: semi.id, region: 'uae', price: 20, currency: 'USD', createdAt: new Date(), updatedAt: new Date() },
      { plan_id: semi.id, region: 'tr', price: 10, currency: 'USD', createdAt: new Date(), updatedAt: new Date() },
      { plan_id: semi.id, region: 'uz', price: 150000, currency: 'UZS', createdAt: new Date(), updatedAt: new Date() },
      // Annual
      { plan_id: annual.id, region: 'ru', price: 1200, currency: 'RUB', createdAt: new Date(), updatedAt: new Date() },
      { plan_id: annual.id, region: 'uae', price: 40, currency: 'USD', createdAt: new Date(), updatedAt: new Date() },
      { plan_id: annual.id, region: 'tr', price: 20, currency: 'USD', createdAt: new Date(), updatedAt: new Date() },
      { plan_id: annual.id, region: 'uz', price: 250000, currency: 'UZS', createdAt: new Date(), updatedAt: new Date() },
    ]);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.bulkDelete('PlanPrices', null, {});
    await queryInterface.bulkDelete('Plans', null, {});
  },
};