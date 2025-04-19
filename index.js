const express = require('express');
const bodyParser = require('body-parser');
const twilio = require('twilio');
const cron = require('node-cron');
require('dotenv').config();

const app = express();
app.use(bodyParser.urlencoded({ extended: false }));

const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
const whatsappFrom = process.env.TWILIO_WHATSAPP_NUMBER;

const usuarios = {};

app.post('/whatsapp', (req, res) => {
  const from = req.body.From;
  const msg = req.body.Body.trim().toLowerCase();
  const twiml = new twilio.twiml.MessagingResponse();
  const response = twiml.message();

  if (!usuarios[from]) {
    usuarios[from] = {
      nombre: null,
      estado: null,
      medicamentos: [],
      citas: [],
      ultimoMensaje: Date.now()
    };
  }

  const usuario = usuarios[from];
  usuario.ultimoMensaje = Date.now();

  if (!usuario.nombre) {
    usuario.nombre = msg.charAt(0).toUpperCase() + msg.slice(1);
    response.body(`Encantada de ayudarte, ${usuario.nombre} 💙 Puedes decirme "medicamento", "cita", "ver" o "ayuda"`);
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
  console.log('Servidor activo en el puerto', PORT);
});
