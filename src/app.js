const express = require('express');
const Joi = require('joi');

const router = express.Router();

const SESSION_ACTIONS = {
  START_SAS_SESSION: 'START_SAS_SESSION',
  END_SAS_SESSION: 'END_SAS_SESSION',
  // other actions...
};

const schemas = {
  [SESSION_ACTIONS.START_SAS_SESSION]: Joi.object({
    intent: Joi.string().required(),
    xml: Joi.string().optional(),
  }),
  [SESSION_ACTIONS.END_SAS_SESSION]: Joi.object({
    // example schema for END_SAS_SESSION
    sessionId: Joi.string().required(),
  }),
  // other schemas...
};

function validateStartSasSessionPayload(payload) {
  return schemas[SESSION_ACTIONS.START_SAS_SESSION].validate(payload);
}

router.post('/start-sas-session', (req, res, next) => {
  const { error } = validateStartSasSessionPayload(req.body);
  if (error) {
    return res.status(400).json({ error: error.details[0].message });
  }
  // handle start session logic...
  res.json({ message: 'SAS session started' });
});

function createTeamsRouter() {
  return router;
}

module.exports = { createTeamsRouter, SESSION_ACTIONS };

