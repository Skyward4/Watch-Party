// server.js
// The server keeps ONE copy of each room's state (video, time, playing or not).
// Browsers talk to the server using socket.io (real-time messages).

var express = require('express');
var app = express();
var http = require('http').createServer(app);
var io = require('socket.io')(http);

// send the files in the "public" folder to the browser
app.use(express.static('public'));

// all rooms live here, for example: rooms['ABCDE'] = { host: ..., users: {...}, ... }
// (it is only in memory, so it is lost when the server restarts)
var rooms = {};

// make a random room code with 5 letters
function makeCode() {
  var letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  var code = '';
  for (var i = 0; i < 5; i++) {
    var randomNumber = Math.floor(Math.random() * letters.length);
    code = code + letters[randomNumber];
  }
  return code;
}

// Work out what time the video is at RIGHT NOW.
// If it is playing: saved time + seconds passed since we saved it.
// If it is paused: just the saved time.
function getTime(room) {
  if (room.playing == true) {
    var secondsPassed = (Date.now() - room.updatedAt) / 1000;
    return room.time + secondsPassed;
  }
  return room.time;
}

// send the list of users to everybody in the room
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

// put a user into a room
function joinRoom(socket, code, name) {
  var room = rooms[code];
  socket.join(code);          // socket.io "room" so we can message everyone in it
  socket.roomCode = code;     // remember which room this user is in
  room.users[socket.id] = name;

  // LATE JOIN: give the new user the current state so they can catch up
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

// this runs every time a browser connects
io.on('connection', function(socket) {

  // ----- rooms -----
  socket.on('create-room', function(name) {
    var code = makeCode();
    rooms[code] = {
      host: socket.id,          // the creator is the host
      users: {},                // socket id -> name
      video: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
      playing: false,
      time: 0,                  // video time in seconds when we last saved
      updatedAt: Date.now(),    // real clock time when we last saved
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

  // ----- play / pause / seek -----
  // we save the new state, then tell everyone EXCEPT the sender (socket.to)
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

  // ----- drift check -----
  // the browser asks "what time should it be?" and we answer
  socket.on('get-time', function() {
    var room = rooms[socket.roomCode];
    socket.emit('server-time', { time: getTime(room), playing: room.playing });
  });

  // ----- change movie -----
  socket.on('change-video', function(url) {
    var room = rooms[socket.roomCode];
    room.video = url;
    room.playing = false;
    room.time = 0;
    room.updatedAt = Date.now();
    io.to(socket.roomCode).emit('change-video', url);
  });

  // ----- chat and emoji (io.to = send to everyone, including the sender) -----
  socket.on('chat', function(text) {
    var room = rooms[socket.roomCode];
    io.to(socket.roomCode).emit('chat', { name: room.users[socket.id], text: text });
  });

  socket.on('reaction', function(emoji) {
    io.to(socket.roomCode).emit('reaction', emoji);
  });

  // ----- playlist -----
  // we only store the movie NUMBER (position in the movies list in script.js)
  socket.on('add-playlist', function(movieNumber) {
    var room = rooms[socket.roomCode];
    room.playlist.push(movieNumber);
    io.to(socket.roomCode).emit('playlist', room.playlist);
  });

  // ----- poll -----
  // options = movie numbers, votes = how many votes each option has
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

  // ----- host transfer -----
  socket.on('transfer-host', function(newHostId) {
    var room = rooms[socket.roomCode];
    if (room.host == socket.id) {   // only the current host is allowed
      room.host = newHostId;
      sendUsers(socket.roomCode);
    }
  });

  // ----- someone leaves -----
  socket.on('disconnect', function() {
    var code = socket.roomCode;
    if (rooms[code] == undefined) {
      return;
    }
    var room = rooms[code];
    delete room.users[socket.id];

    var ids = Object.keys(room.users);
    if (ids.length == 0) {
      delete rooms[code];           // empty room, remove it
      return;
    }
    if (room.host == socket.id) {
      room.host = ids[0];           // host left, first remaining user is the new host
    }
    sendUsers(code);
  });
});

http.listen(3000, function() {
  console.log('Server running on http://localhost:3000');
});
