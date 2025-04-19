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

cron.schedule('* * * * *', () => {
  const horaActual = obtenerHoraLocal();
  const fechaActual = obtenerFechaActualISO();

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
      if (cita.fechaISO === fechaActual && cita.hora === horaActual) {
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

  // Ver listado guardado
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
        texto += `\n${i + 1}. ${c.descripcion} el ${c.fechaOriginal} a las ${c.hora}`;
      });
    } else {
      texto += '\n\n📅 No hay citas registradas.';
    }

    response.body(texto);
    res.set('Content-Type', 'text/xml');
    res.send(twiml.toString());
    return;
  }

  // Eliminar
  if (msg === 'eliminar') {
    usuario.estado = 'eliminar_tipo';
    response.body('¿Qué quieres eliminar, cielo?\n1️⃣ Medicamento\n2️⃣ Cita médica');
    res.set('Content-Type', 'text/xml');
    res.send(twiml.toString());
    return;
  }

  switch (usuario.estado) {
    case 'eliminar_tipo':
      if (msg === '1') {
        if (usuario.medicamentos.length === 0) {
          response.body('No tienes medicamentos guardados 💊');
          usuario.estado = null;
        } else {
          usuario.estado = 'eliminar_medicamento';
          let texto = 'Estos son tus medicamentos:\n';
          usuario.medicamentos.forEach((m, i) => {
            texto += `\n${i + 1}. ${m.nombre} a las ${m.hora}`;
          });
          texto += '\n\nEscribe el número del que quieres eliminar.';
          response.body(texto);
        }
      } else if (msg === '2') {
        if (usuario.citas.length === 0) {
          response.body('No tienes citas guardadas 📅');
          usuario.estado = null;
        } else {
          usuario.estado = 'eliminar_cita';
          let texto = 'Estas son tus citas:\n';
          usuario.citas.forEach((c, i) => {
            texto += `\n${i + 1}. ${c.descripcion} el ${c.fechaOriginal} a las ${c.hora}`;
          });
          texto += '\n\nEscribe el número de la que quieres eliminar.';
          response.body(texto);
        }
      } else {
        response.body('Por favor, responde con 1 para medicamento o 2 para cita.');
      }
      break;

    case 'eliminar_medicamento':
      const iMed = parseInt(msg) - 1;
      if (!isNaN(iMed) && usuario.medicamentos[iMed]) {
        const eliminado = usuario.medicamentos.splice(iMed, 1)[0];
        response.body(`He eliminado el medicamento "${eliminado.nombre}" de tus recordatorios 💊`);
      } else {
        response.body('Ese número no corresponde a ningún medicamento. Intenta de nuevo.');
      }
      usuario.estado = null;
      break;

    case 'eliminar_cita':
      const iCita = parseInt(msg) - 1;
      if (!isNaN(iCita) && usuario.citas[iCita]) {
        const eliminado = usuario.citas.splice(iCita, 1)[0];
        response.body(`He eliminado la cita "${eliminado.descripcion}" del ${eliminado.fechaOriginal} 📅`);
      } else {
        response.body('Ese número no corresponde a ninguna cita. Intenta de nuevo.');
      }
      usuario.estado = null;
      break;

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
      const fechaISO = formatearFechaUsuario(msg);
      if (!fechaISO) {
        response.body('Parece que la fecha no tiene el formato correcto. Por favor, escribe como esto: 24/04/2025');
        break;
      }
      usuario.cita.fechaISO = fechaISO;
      usuario.cita.fechaOriginal = msg;
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
        response.body('No entendí muy bien eso... pero estoy aquí para ayudarte 🧡. Puedes escribirme "medicamento", "cita", "ver" o "eliminar".');
      }
  }

  res.set('Content-Type', 'text/xml');
  res.send(twiml.toString());
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor activo en el puerto ${PORT}`);
});
