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
// START SERVER IMEDIATO
// =============================
const PORT = process.env.PORT || 3000;

app.listen(PORT, '0.0.0.0', () => {
  console.log('SERVER ONLINE NA PORTA', PORT);
});

// =============================
// HEALTHCHECK (ESSENCIAL)
// =============================
app.get('/', (req, res) => {
  res.send('OK');
});

// =============================
// QR ROUTE
// =============================
app.get('/qr', async (req, res) => {
  try {
    if (!qrCode) {
      return res.send('QR ainda não disponível');
    }

    const buffer = await QRCode.toBuffer(qrCode);

    res.setHeader('Content-Type', 'image/png');
    res.send(buffer);

  } catch (err) {
    res.status(500).send('Erro QR');
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

    await sock.sendMessage(phone + '@s.whatsapp.net', { text });

    res.json({ ok: true });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// =============================
// START WHATSAPP (DELAY)
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
          setTimeout(startSock, 3000);
        }
      }
    });

  } catch (err) {
    console.log('ERRO WA:', err.message);
    setTimeout(startSock, 5000);
  }
}

// ⛔ DELAY CRÍTICO (resolve Railway)
setTimeout(() => {
  startSock();
}, 5000);
