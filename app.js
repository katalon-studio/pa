require('dotenv').config();
const express = require('express')
const bodyParser = require('body-parser')
const app = express()
const service = require('./index')
const port = 8888

app.use(bodyParser.json())
app.use(
  bodyParser.urlencoded({
    extended: true,
  })
)

app.post('/', (req, res) => {
  return service.createElement(req.body)
    .then(() => res.send('OK'))
    .catch((e) => {
      res.status(500);
      res.send(e);
    });
})

app.listen(port, () => console.log(`Listening on port ${port}!`))