const express = require('express');
const bodyParser = require('body-parser');
const cron = require('node-cron');
const twilio = require('twilio');
require('dotenv').config();

const app = express();
app.use(bodyParser.urlencoded({ extended: false }));

const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
const whatsappFrom = process.env.TWILIO_WHATSAPP_NUMBER;

const usuarios = {};
const mensajesAnimo = [
  "Recuerda que estás haciendo un gran trabajo cuidando de ti 🧡",
  "¿Cómo amaneciste hoy? Estoy aquí si necesitas algo 😊",
  "No olvides beber agua y sonreír un poquito hoy 💧😊"
];

function obtenerHoraLocal() {
  const ahoraUTC = new Date();
  const ahoraEspaña = new Date(ahoraUTC.getTime() + 2 * 60 * 60 * 1000); // UTC+2
  return ahoraEspaña.toTimeString().substring(0, 5);
}

function obtenerFechaActualISO() {
  const ahoraUTC = new Date();
  const ahoraEspaña = new Date(ahoraUTC.getTime() + 2 * 60 * 60 * 1000);
  return ahoraEspaña.toISOString().split('T')[0]; // YYYY-MM-DD
}

// CRON para mensajes diarios, resumen y ánimo
cron.schedule('* * * * *', () => {
  const ahora = Date.now();
  const hora = obtenerHoraLocal();
  const fecha = obtenerFechaActualISO();

  Object.entries(usuarios).forEach(([numero, usuario]) => {
    // Resumen diario a las 07:00
    if (hora === '07:00') {
      let resumen = `🌞 Buenos días ${usuario.nombre || 'cariño'}! Hoy tienes:
`;
      let tiene = false;

      usuario.medicamentos?.forEach(m => {
        resumen += `- 💊 ${m.nombre} a las ${m.hora}
`;
        tiene = true;
      });

      usuario.citas?.forEach(c => {
        if (c.fecha === fecha) {
          resumen += `- 📅 ${c.descripcion} a las ${c.hora}
`;
          tiene = true;
        }
      });

      if (tiene) {
        client.messages.create({ from: whatsappFrom, to: numero, body: resumen.trim() });
      }
    }

    // Mensaje de ánimo a las 10:00
    if (hora === '10:00') {
      const mensaje = mensajesAnimo[Math.floor(Math.random() * mensajesAnimo.length)];
      client.messages.create({ from: whatsappFrom, to: numero, body: mensaje });
    }

    // Inactividad > 3 días
    if (usuario.ultimoMensaje && ahora - usuario.ultimoMensaje > 3 * 24 * 60 * 60 * 1000) {
      client.messages.create({
        from: whatsappFrom,
        to: numero,
        body: `¡Hola ${usuario.nombre || 'cariño'}! Hace unos días que no hablamos, ¿quieres que revisemos tus citas o medicinas? 💊📅`
      });
      usuario.ultimoMensaje = ahora;
    }
  });
});

app.post('/whatsapp', (req, res) => {
  const from = req.body.From;
  const msg = req.body.Body.trim().toLowerCase();
  const twiml = new twilio.twiml.MessagingResponse();
  const response = twiml.message();

  if (!usuarios[from]) {
    usuarios[from] = {
      nombre: null,
      estado: null,
      medicamento: null,
      cita: null,
      medicamentos: [],
      citas: [],
      ultimoMensaje: Date.now()
    };
  }

  const usuario = usuarios[from];
  usuario.ultimoMensaje = Date.now();

  if (!usuario.nombre) {
    usuario.nombre = msg.charAt(0).toUpperCase() + msg.slice(1);
    response.body(`Encantada de ayudarte, ${usuario.nombre} 💙 ¿Quieres que te recuerde un medicamento o una cita?`);
    res.set('Content-Type', 'text/xml');
    res.send(twiml.toString());
    return;
  }

  if (msg === 'ayuda') {
    response.body(`Puedo ayudarte con estas cosas:
💊 Recordar medicamentos
📅 Citas médicas
👁 Ver lo que tienes guardado
✂️ Eliminar algo
Solo dime la palabra y lo hacemos juntas 😊`);
    res.set('Content-Type', 'text/xml');
    res.send(twiml.toString());
    return;
  }

  response.body(`Hola ${usuario.nombre} 👋 ¿Qué necesitas hoy? Puedes decirme "medicamento", "cita", "ver", "eliminar" o "ayuda".`);
  res.set('Content-Type', 'text/xml');
  res.send(twiml.toString());
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log('Clara v7 está en marcha en el puerto', PORT);
});
