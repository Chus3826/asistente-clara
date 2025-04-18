const express = require('express');
const bodyParser = require('body-parser');
const { MessagingResponse } = require('twilio').twiml;

const app = express();
app.use(bodyParser.urlencoded({ extended: false }));

app.post('/whatsapp', (req, res) => {
  const msg = req.body.Body.toLowerCase().trim();
  const twiml = new MessagingResponse();
  const response = twiml.message();

  console.log('Mensaje recibido:', msg);

  if (msg.includes('hola')) {
    response.body('Hola cariño 😊 Soy Clara, tu asistente. ¿Quieres que te recuerde algún medicamento o una cita médica?');
  } else if (msg.includes('medicamento')) {
    response.body('Perfecto 💊 ¿Cómo se llama el medicamento que quieres que te recuerde?');
  } else {
    response.body('No entendí muy bien eso... pero estoy aquí para ayudarte 🧡. Puedes escribirme "medicamento" o "cita".');
  }

  res.set('Content-Type', 'text/xml');
  res.send(twiml.toString());
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor activo en el puerto ${PORT}`);
});
