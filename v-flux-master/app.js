const express = require('express');
const morgan = require('morgan');
const app = express();





app.use(morgan('dev'));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());






module.exports = app;