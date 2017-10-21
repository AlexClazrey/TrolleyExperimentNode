const serialPort = require('serialport');
const io = require('socket.io-client');

const isNumber = function(num) { return typeof num === 'number'; };

const address = ['127.0.0.1:3005', '127.0.0.1:3000', '67.216.202.206:3000', '192.168.1.153:3005'];
const timers = [];
const sockets = [];
const reconnectDelay = 5000;

const serialPortAddress = process.env.comPort || 'COM3';
// controlContent schema 'angle <phi> <theta>'
let controlContent = '';
let servoState = {
  phi: null,
  theta: null
};

// data schema { phi: number, theta: number }
const commandProcess = function(data) {
  if(isNumber(data.phi) && isNumber(data.theta)) {
    controlContent = 'angle ' + data.phi + ' ' + data.theta;
    portWrite(controlContent);
  } else {
    console.error('cannot parse command got from socket', data);
  }
};

// socket.io client connect part
const connect = function(domain, index) {
  const sock = io('http://' + domain + '/experiment');
  sock.on('error', function() {
    // retry connect
    if(!sock.socket.connected) {
      connectFailed(domain, index);
    }
  });
  sock.on('connect', function() { connectSucceed(domain, index); });
  sock.on('servo-command', commandProcess);
  sockets[index] = sock;
};

const connectSucceed = function(domain, index) {
  console.log('[OK]', domain, '#' + index, 'connect succeed');
  clearInterval(timers)
};

const connectFailed = function(domain, index) {
  console.error('[ERROR]', domain, 'connect failed, retry in', reconnectDelay + 'ms');
  clearInterval(timers[index]);
  timers[index] = setInterval(function() { connect(domain, index); }, reconnectDelay);
};

address.forEach(connect);

const socketEmit = function(event, data) {
  sockets.forEach(function(item) {
    if(item && item.connected) {
      item.emit(event, data);
    }
  });
};


// serial port part
let writeCount = 0;
const port = new serialPort(serialPortAddress, {
  baudRate: 9600,
  parser: serialPort.parsers.readline('\n')
});
port.on('open', function() {
  console.log('[OK] serial port opened:', port.isOpen());
});
const portWrite = function(str) {
  port.write(str, function(err) {
    if(err)
      console.error('[ERROR]', 'port writing error', err);
    else
      console.log('[OK]', 'writing #' + (writeCount++), ':', str);
  })
};

port.on('data', function(data) {
  // data schema 'angle <phi> <theta>'
  if(data.indexOf('angle ') === 0) {
    const args = data.split(' ');
    const phi = parseInt(args[1]);
    const theta = parseInt(args[2]);
    if(phi >= 0 && phi <= 180 && theta >= 0 && theta <= 180) {
      servoState.phi = phi;
      servoState.theta = theta;
      servoState.timestamp = Date.now();
      // upload
      socketEmit('servo-direction', {
        timestamp: servoState.timestamp,
        phi,
        theta,
      });
    } else {
      console.error('[ERROR]', 'cannot parse data received on serial port', data);
    }
  } else {
    console.error('[ERROR]', 'cannot parse data received on serial port', data);
  }
});