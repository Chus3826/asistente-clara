const express = require('express');
const bodyParser = require('body-parser');
const cron = require('node-cron');
const twilio = require('twilio');
require('dotenv').config();

const app = express();
app.use(bodyParser.urlencoded({ extended: false }));

const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
const whatsappFrom = process.env.TWILIO_WHATSAPP_NUMBER;

// Estado en memoria
const usuarios = {};

// Ajustar la hora a UTC+2
function obtenerHoraLocal() {
  const ahoraUTC = new Date();
  const ahoraEspaña = new Date(ahoraUTC.getTime() + 2 * 60 * 60 * 1000); // UTC+2
  return ahoraEspaña.toTimeString().substring(0, 5); // "HH:MM"
}

function obtenerFechaLocal() {
  const ahoraUTC = new Date();
  const ahoraEspaña = new Date(ahoraUTC.getTime() + 2 * 60 * 60 * 1000); // UTC+2
  return ahoraEspaña.toLocaleDateString('es-ES'); // dd/mm/yyyy
}

// Revisión cada minuto
cron.schedule('* * * * *', () => {
  const horaActual = obtenerHoraLocal();
  const fechaActual = obtenerFechaLocal();

  Object.keys(usuarios).forEach(numero => {
    const usuario = usuarios[numero];

    usuario.medicamentos?.forEach(med => {
      if (med.hora === horaActual) {
        client.messages.create({
          from: whatsappFrom,
          to: numero,
          body: `🕒 ¡Hola! Es hora de tomar tu medicamento: ${med.nombre} 💊`
        });
      }
    });

    usuario.citas?.forEach(cita => {
      if (cita.fecha === fechaActual && cita.hora === horaActual) {
        client.messages.create({
          from: whatsappFrom,
          to: numero,
          body: `📅 ¡Hola! Tienes una cita médica: ${cita.descripcion} hoy a las ${cita.hora} 🏥`
        });
      }
    });
  });
});

app.post('/whatsapp', (req, res) => {
  const from = req.body.From;
  const msg = req.body.Body.toLowerCase().trim();
  const twiml = new twilio.twiml.MessagingResponse();
  const response = twiml.message();

  if (!usuarios[from]) {
    usuarios[from] = {
      estado: null,
      medicamento: null,
      cita: null,
      medicamentos: [],
      citas: []
    };
  }

  const usuario = usuarios[from];

  if (msg === 'ver') {
    let texto = '📋 Esto es lo que tengo guardado para ti:\n';

    if (usuario.medicamentos.length > 0) {
      texto += '\n💊 Medicamentos:';
      usuario.medicamentos.forEach((m, i) => {
        texto += `\n${i + 1}. ${m.nombre} a las ${m.hora}`;
      });
    } else {
      texto += '\n💊 No hay medicamentos registrados.';
    }

    if (usuario.citas.length > 0) {
      texto += '\n\n📅 Citas médicas:';
      usuario.citas.forEach((c, i) => {
        texto += `\n${i + 1}. ${c.descripcion} el ${c.fecha} a las ${c.hora}`;
      });
    } else {
      texto += '\n\n📅 No hay citas registradas.';
    }

    response.body(texto);
    res.set('Content-Type', 'text/xml');
    res.send(twiml.toString());
    return;
  }

  switch (usuario.estado) {
    case 'esperando_nombre_medicamento':
      usuario.medicamento = msg;
      usuario.estado = 'esperando_hora_medicamento';
      response.body(`¿A qué hora quieres que te recuerde tomar ${msg}? (Ej: 09:00)`);
      break;

    case 'esperando_hora_medicamento':
      usuario.medicamentos.push({ nombre: usuario.medicamento, hora: msg });
      usuario.estado = null;
      usuario.medicamento = null;
      response.body('¡Perfecto! Te recordaré ese medicamento cada día a esa hora 🕒');
      break;

    case 'esperando_descripcion_cita':
      usuario.cita = { descripcion: msg };
      usuario.estado = 'esperando_fecha_cita';
      response.body('¿Qué día es la cita? (Ej: 24/04/2025)');
      break;

    case 'esperando_fecha_cita':
      usuario.cita.fecha = msg;
      usuario.estado = 'esperando_hora_cita';
      response.body('¿A qué hora es la cita? (Ej: 11:30)');
      break;

    case 'esperando_hora_cita':
      usuario.cita.hora = msg;
      usuario.citas.push(usuario.cita);
      usuario.estado = null;
      usuario.cita = null;
      response.body('¡Anotado! Te recordaré esa cita médica 📅');
      break;

    default:
      if (msg.includes('hola')) {
        response.body('Hola cariño 😊 Soy Clara, tu asistente. ¿Quieres que te recuerde algún medicamento o una cita médica?');
      } else if (msg.includes('medicamento')) {
        usuario.estado = 'esperando_nombre_medicamento';
        response.body('Perfecto 💊 ¿Cómo se llama el medicamento que quieres que te recuerde?');
      } else if (msg.includes('cita')) {
        usuario.estado = 'esperando_descripcion_cita';
        response.body('Muy bien 😊 ¿De qué es la cita? (Ej: dentista, cardiólogo...)');
      } else {
        response.body('No entendí muy bien eso... pero estoy aquí para ayudarte 🧡. Puedes escribirme "medicamento", "cita" o "ver".');
      }
  }

  res.set('Content-Type', 'text/xml');
  res.send(twiml.toString());
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor activo en el puerto ${PORT}`);
});
