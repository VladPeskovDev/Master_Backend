const express = require('express');
const morgan = require('morgan');
const nodeSyncRouter = require('./routes/nodeSyncRouter');

const app = express();

app.use(morgan('dev'));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Routes
app.use('/api/nodes', nodeSyncRouter);

module.exports = app;