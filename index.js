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
  "¡Hola cariño! ¿Cómo amaneciste hoy? Estoy aquí si necesitas algo 😊",
  "No olvides beber agua y sonreír un poquito hoy 💧😊"
];

function formatearFechaUsuario(fecha) {
  const partes = fecha.split('/');
  if (partes.length === 3) {
    const [dia, mes, año] = partes;
    return `${año.padStart(4, '20')}-${mes.padStart(2, '0')}-${dia.padStart(2, '0')}`;
  }
  return null;
}

function obtenerFechaActualISO() {
  const ahoraUTC = new Date();
  const ahoraEspaña = new Date(ahoraUTC.getTime() + 2 * 60 * 60 * 1000);
  return ahoraEspaña.toISOString().split('T')[0];
}

function obtenerHoraLocal() {
  const ahoraUTC = new Date();
  const ahoraEspaña = new Date(ahoraUTC.getTime() + 2 * 60 * 60 * 1000);
  return ahoraEspaña.toTimeString().substring(0, 5);
}

function enviarMensaje(to, body) {
  client.messages.create({
    from: whatsappFrom,
    to,
    body
  });
}

// CRON: recordatorios, resumen diario, ánimo y seguimiento
cron.schedule('* * * * *', () => {
  const horaActual = obtenerHoraLocal();
  const fechaActual = obtenerFechaActualISO();

  Object.keys(usuarios).forEach(numero => {
    const usuario = usuarios[numero];

    // Recordatorios de medicamentos
    usuario.medicamentos?.forEach(med => {
      if (med.hora === horaActual) {
        enviarMensaje(numero, `🕒 ¡Hola ${usuario.nombre || 'cariño'}! Es hora de tomar tu medicamento: ${med.nombre} 💊`);
      }
    });

    // Recordatorios de citas
    usuario.citas?.forEach(cita => {
      if (cita.fechaISO === fechaActual && cita.hora === horaActual) {
        enviarMensaje(numero, `📅 ¡Hola ${usuario.nombre || 'cariño'}! Tienes una cita médica: ${cita.descripcion} hoy a las ${cita.hora} 🏥`);
      }
    });

    // Resumen diario a las 07:00
    if (horaActual === '07:00') {
      let resumen = `🌞 Buenos días ${usuario.nombre || 'cariño'}! Hoy tienes:
`;
      let tieneAlgo = false;

      usuario.medicamentos.forEach(m => {
        resumen += `- 💊 ${m.nombre} a las ${m.hora}
`;
        tieneAlgo = true;
      });

      usuario.citas.forEach(c => {
        if (c.fechaISO === fechaActual) {
          resumen += `- 📅 ${c.descripcion} a las ${c.hora}
`;
          tieneAlgo = true;
        }
      });

      if (tieneAlgo) {
        enviarMensaje(numero, resumen.trim());
      }
    }

    // Mensajes de ánimo una vez al día a las 10:00
    if (horaActual === '10:00') {
      const mensaje = mensajesAnimo[Math.floor(Math.random() * mensajesAnimo.length)];
      enviarMensaje(numero, mensaje);
    }

    // Inactividad: si no ha hablado en 3 días
    const ahora = Date.now();
    if (usuario.ultimoMensaje && ahora - usuario.ultimoMensaje > 3 * 24 * 60 * 60 * 1000) {
      enviarMensaje(numero, `Hola ${usuario.nombre || 'cariño'} 😊 Hace días que no hablamos, ¿necesitas que revisemos tus citas o medicinas?`);
      usuario.ultimoMensaje = ahora; // Evitar que lo mande seguido
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
      estado: null,
      nombre: null,
      medicamento: null,
      cita: null,
      medicamentos: [],
      citas: [],
      ultimoMensaje: Date.now()
    };
  }

  const usuario = usuarios[from];
  usuario.ultimoMensaje = Date.now();

  // Asignar nombre
  if (!usuario.nombre) {
    usuario.nombre = msg.charAt(0).toUpperCase() + msg.slice(1);
    response.body(`Encantada de ayudarte, ${usuario.nombre} 😊 Puedes decirme "medicamento", "cita", "ver", "eliminar" o "ayuda"`);
    res.set('Content-Type', 'text/xml');
    res.send(twiml.toString());
    return;
  }

  if (msg === 'ayuda') {
    response.body(`Puedo ayudarte con esto:
💊 Recordar medicamentos
📅 Citas médicas
👁 Ver lo que tienes
✂️ Eliminar algo
Solo dime la palabra y lo hacemos 😊`);
    res.set('Content-Type', 'text/xml');
    res.send(twiml.toString());
    return;
  }

  // ... aquí se incluiría el resto del flujo de medicamentos, citas, ver, eliminar
  response.body(`Hola ${usuario.nombre} 👋 Estoy lista para ayudarte. Puedes decirme "medicamento", "cita", "ver", "eliminar" o "ayuda".`);
  res.set('Content-Type', 'text/xml');
  res.send(twiml.toString());
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log('Clara está funcionando en el puerto', PORT);
});
