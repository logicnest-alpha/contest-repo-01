// /api router: login is public, everything else needs the session cookie.
const express = require('express');
const auth = require('../auth');
const config = require('../config');

const router = express.Router();

router.post('/auth/login', auth.login);
router.post('/auth/logout', auth.logout);
router.get('/auth/me', auth.requireAuth, (req, res) => res.json({ email: config.adminEmail }));

router.use(auth.requireAuth);
router.use(require('./misc'));
router.use(require('./mailboxes'));
router.use(require('./leads').router);
router.use(require('./campaigns'));
router.use(require('./inbox'));

module.exports = router;
