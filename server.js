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

let sock = null;
let qrCode = null;

// =============================
// START WHATSAPP
// =============================
async function startSock() {
  try {
    const { state, saveCreds } = await useMultiFileAuthState('./auth');
    const { version } = await fetchLatestBaileysVersion();

    sock = makeWASocket({
      version,
      auth: state,
      logger
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
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
          console.log('RECONEXÃO EM 3s...');
          setTimeout(() => startSock(), 3000);
        } else {
          console.log('LOGOUT DETECTADO - PRECISA NOVO QR');
        }
      }
    });

  } catch (err) {
    console.log('ERRO START:', err.message);
    setTimeout(() => startSock(), 5000);
  }
}

startSock();

// =============================
// QR ROUTE (SUPER ESTÁVEL)
// =============================
app.get('/qr', async (req, res) => {
  try {
    if (!qrCode) {
      return res.status(200).send('QR ainda não disponível. Atualize.');
    }

    const buffer = await QRCode.toBuffer(qrCode);

    res.setHeader('Content-Type', 'image/png');
    res.send(buffer);

  } catch (err) {
    console.log('ERRO QR:', err.message);
    res.status(500).send('Erro ao gerar QR');
  }
});

// =============================
// SEND MESSAGE
// =============================
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
    console.log('ERRO SEND:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// =============================
// SERVER
// =============================
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log('REVNEX WA RODANDO');
});
