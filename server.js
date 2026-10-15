var express = require('express');
var app = express();
var http = require('http').createServer(app);
var io = require('socket.io')(http);

app.use(express.static('public'));


var rooms = {};

function makeCode() {
  var letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  var code = '';
  for (var i = 0; i < 5; i++) {
    var randomNumber = Math.floor(Math.random() * letters.length);
    code = code + letters[randomNumber];
  }
  return code;
}
function getTime(room) {
  if (room.playing == true) {
    var secondsPassed = (Date.now() - room.updatedAt) / 1000;
    return room.time + secondsPassed;
  }
  return room.time;
}
function sendUsers(code) {
  var room = rooms[code];
  var list = [];
  for (var id in room.users) {
    var user = { id: id, name: room.users[id], isHost: false };
    if (id == room.host) {
      user.isHost = true;
    }
    list.push(user);
  }
  io.to(code).emit('users', list);
}
function joinRoom(socket, code, name) {
  var room = rooms[code];
  socket.join(code);          
  socket.roomCode = code;     
  room.users[socket.id] = name;

  
  socket.emit('joined', {
    code: code,
    video: room.video,
    playing: room.playing,
    time: getTime(room),
    playlist: room.playlist,
    poll: room.poll
  });

  sendUsers(code);
  io.to(code).emit('chat', { name: 'System', text: name + ' joined' });
}

io.on('connection', function(socket) {

 
  socket.on('create-room', function(name) {
    var code = makeCode();
    rooms[code] = {
      host: socket.id,         
      users: {},                
      video: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
      playing: false,
      time: 0,                  
      updatedAt: Date.now(),    
      playlist: [],
      poll: null
    };
    joinRoom(socket, code, name);
  });

  socket.on('join-room', function(data) {
    var code = data.code.toUpperCase();
    if (rooms[code]) {
      joinRoom(socket, code, data.name);
    } else {
      socket.emit('error-msg', 'Room not found!');
    }
  });
  socket.on('play', function(time) {
    var room = rooms[socket.roomCode];
    room.playing = true;
    room.time = time;
    room.updatedAt = Date.now();
    socket.to(socket.roomCode).emit('play', time);
  });

  socket.on('pause', function(time) {
    var room = rooms[socket.roomCode];
    room.playing = false;
    room.time = time;
    room.updatedAt = Date.now();
    socket.to(socket.roomCode).emit('pause', time);
  });

  socket.on('seek', function(time) {
    var room = rooms[socket.roomCode];
    room.time = time;
    room.updatedAt = Date.now();
    socket.to(socket.roomCode).emit('seek', time);
  });

  
  socket.on('get-time', function() {
    var room = rooms[socket.roomCode];
    socket.emit('server-time', { time: getTime(room), playing: room.playing });
  });

  
  socket.on('change-video', function(url) {
    var room = rooms[socket.roomCode];
    room.video = url;
    room.playing = false;
    room.time = 0;
    room.updatedAt = Date.now();
    io.to(socket.roomCode).emit('change-video', url);
  });

  
  socket.on('chat', function(text) {
    var room = rooms[socket.roomCode];
    io.to(socket.roomCode).emit('chat', { name: room.users[socket.id], text: text });
  });

  socket.on('reaction', function(emoji) {
    io.to(socket.roomCode).emit('reaction', emoji);
  });

  
  socket.on('add-playlist', function(movieNumber) {
    var room = rooms[socket.roomCode];
    room.playlist.push(movieNumber);
    io.to(socket.roomCode).emit('playlist', room.playlist);
  });
  socket.on('start-poll', function(options) {
    var room = rooms[socket.roomCode];
    room.poll = { options: options, votes: [] };
    for (var i = 0; i < options.length; i++) {
      room.poll.votes.push(0);
    }
    io.to(socket.roomCode).emit('poll', room.poll);
  });

  socket.on('vote', function(optionNumber) {
    var room = rooms[socket.roomCode];
    if (room.poll != null) {
      room.poll.votes[optionNumber] = room.poll.votes[optionNumber] + 1;
      io.to(socket.roomCode).emit('poll', room.poll);
    }
  });

 
  socket.on('transfer-host', function(newHostId) {
    var room = rooms[socket.roomCode];
    if (room.host == socket.id) {   
      room.host = newHostId;
      sendUsers(socket.roomCode);
    }
  });

  socket.on('disconnect', function() {
    var code = socket.roomCode;
    if (rooms[code] == undefined) {
      return;
    }
    var room = rooms[code];
    delete room.users[socket.id];

    var ids = Object.keys(room.users);
    if (ids.length == 0) {
      delete rooms[code];           
      return;
    }
    if (room.host == socket.id) {
      room.host = ids[0];           
    }
    sendUsers(code);
  });
});

http.listen(3000, function() {
  console.log('Server running on http://localhost:3000');
});
