require('dotenv').config();

const express = require('express');
const cors = require('cors');
const pino = require('pino');
const {
  default: makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion
} = require('@whiskeysockets/baileys');

const app = express();
app.use(cors());
app.use(express.json());

const logger = pino({ level: 'info' });

let sock;
let qrCode = null;

async function start() {
  const { state, saveCreds } = await useMultiFileAuthState('./auth');
  const { version } = await fetchLatestBaileysVersion();

  sock = makeWASocket({
    version,
    auth: state,
    logger
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', (update) => {
    const { connection, qr } = update;

    if (qr) {
      qrCode = qr;
      console.log('QR GERADO');
    }

    if (connection === 'open') {
      console.log('WHATSAPP CONECTADO');
    }
  });
}

const QRCode = require('qrcode');

app.get('/qr', async (req, res) => {
  if (!qrCode) {
    return res.send('QR ainda não gerado. Recarregue.');
  }

  try {
    const qrImage = await QRCode.toDataURL(qrCode);
    res.send(`
      <html>
        <body style="display:flex;justify-content:center;align-items:center;height:100vh;">
          <img src="${qrImage}" />
        </body>
      </html>
    `);
  } catch (err) {
    res.status(500).send('Erro ao gerar QR');
  }
});
app.post('/send', async (req, res) => {
  try {
    const { phone, text } = req.body;

    const jid = phone + '@s.whatsapp.net';

    await sock.sendMessage(jid, { text });

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

start();

app.listen(3000, () => {
  console.log('REVNEX WA RODANDO');
});
