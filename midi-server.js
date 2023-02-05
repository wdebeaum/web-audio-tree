// midi-server.js - read a midi device file and send each 3-byte note on/off
// message over a websocket

// install:
// npm install websocket
// run:
// node midi-server.js

/* eslint-env node */

const fs = require('fs');
const http = require('http');
const WebSocketServer = require('websocket').server;

const dev = '/dev/snd/midiC0D0';

const server = http.createServer((request, response) => {
  response.writeHead(404);
  response.end();
});
server.listen(22468, () => {
  console.log('listening');
});

const wsServer = new WebSocketServer({
  httpServer: server,
  autoAcceptConnections: false
});
  
const buffer = Buffer.alloc(3);

function eachMessage(fd, cb, pos) {
  if (pos === undefined) { pos = 0; }
  fs.read(fd, buffer, pos, 3 - pos, null, (err, bytesRead, buf) => {
    pos += bytesRead;
    if (err) {
      console.log('read from ' + dev + ' failed');
      console.log(err);
    } else if (pos == 3) {
      cb(buf);
      pos = 0;
    }
    eachMessage(fd, cb, pos);
  });
}

wsServer.on('request', (request) => {
  console.log('received ws request');
  if (request.origin != 'http://localhost:11235') {
    request.reject();
    console.log('bad origin: ' + request.origin);
    return;
  }
  const connection = request.accept('midi', request.origin);
  console.log('accepted ws connection');
  fs.open(dev, 'r', (err, fd) => {
    eachMessage(fd, buf => {
      //connection.sendBytes(Buffer.from(buf)); // doesn't work :(
      connection.sendUTF(JSON.stringify(Array.from(buf)));
    });
    connection.on('close', (reasonCode, description) => {
      console.log('closed ws connection');
    });
  });
});
