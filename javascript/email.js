const functions = require('firebase-functions');
const admin = require('firebase-admin');
const nodemailer = require('nodemailer');
const cors = require('cors')({ origin: true });

admin.initializeApp();
const db = admin.firestore();

const cfg = functions.config().smtp || {};
const transporter = nodemailer.createTransport({ /* same as above */ });

exports.sendReservationEmail = functions.https.onRequest((req, res) => {
  cors(req, res, async () => {
    if (req.method === 'OPTIONS') return res.status(204).send('');
    try {
      const reservationId = req.body.reservationId || req.query.reservationId;
      if (!reservationId) return res.status(400).json({ error: 'Missing reservationId' });
      const snap = await db.collection('reservations').doc(reservationId).get();
      if (!snap.exists) return res.status(404).json({ error: 'Not found' });
      const r = snap.data();
      const to = r?.email;
      if (!to) return res.status(400).json({ error: 'No recipient email' });
      await transporter.sendMail({ /* build mail */ from: functions.config().email.from, to, subject: '...', text: '...' });
      res.json({ success: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to send' });
    }
  });
});