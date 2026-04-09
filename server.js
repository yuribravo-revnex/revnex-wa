require('dotenv').config();

const express = require('express');
const cors = require('cors');
const pino = require('pino');
const QRCode = require('qrcode');

const {
  default: makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  DisconnectReason
} = require('@whiskeysockets/baileys');

const app = express();
app.use(cors());
app.use(express.json());

const logger = pino({ level: 'silent' });

let sock;
let qrCode = null;

async function startSock() {
  const { state, saveCreds } = await useMultiFileAuthState('./auth');
  const { version } = await fetchLatestBaileysVersion();

  sock = makeWASocket({
    version,
    auth: state,
    logger
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      qrCode = qr;
      console.log('QR GERADO');
    }

    if (connection === 'open') {
      console.log('WHATSAPP CONECTADO');
      qrCode = null;
    }

    if (connection === 'close') {
      const reason = lastDisconnect?.error?.output?.statusCode;

      console.log('DESCONECTADO:', reason);

      if (reason !== DisconnectReason.loggedOut) {
        console.log('RECONectando...');
        startSock();
      } else {
        console.log('Sessão deslogada. Precisa escanear QR novamente.');
      }
    }
  });
}

startSock();

app.get('/qr', async (req, res) => {
  if (!qrCode) {
    return res.send('QR ainda não gerado. Atualize.');
  }

  const qrImage = await QRCode.toDataURL(qrCode);

  res.send(`
    <html>
      <body style="display:flex;justify-content:center;align-items:center;height:100vh;">
        <img src="${qrImage}" />
      </body>
    </html>
  `);
});

app.post('/send', async (req, res) => {
  try {
    const { phone, text } = req.body;

    if (!sock) {
      return res.status(500).json({ error: 'WhatsApp não conectado' });
    }

    const jid = phone + '@s.whatsapp.net';

    await sock.sendMessage(jid, { text });

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log('REVNEX WA RODANDO');
});
