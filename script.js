// script.js - runs in the browser

var socket = io();   // connect to the server
var video = document.getElementById('video');
var playlist = [];   // list of movie numbers

// IMPORTANT: when the SERVER changes our video, the video fires play/pause/seeked
// events too. If we sent those to the server again we would get an endless loop.
// So we set ignore = true while applying a change from the server.
var ignore = false;

var base = 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/';
var movies = [
  { title: 'Big Buck Bunny', category: 'Animation', url: base + 'BigBuckBunny.mp4' },
  { title: 'Elephants Dream', category: 'Animation', url: base + 'ElephantsDream.mp4' },
  { title: 'Sintel', category: 'Fantasy', url: base + 'Sintel.mp4' },
  { title: 'Tears of Steel', category: 'Sci-Fi', url: base + 'TearsOfSteel.mp4' },
  { title: 'For Bigger Blazes', category: 'Action', url: base + 'ForBiggerBlazes.mp4' },
  { title: 'For Bigger Escapes', category: 'Action', url: base + 'ForBiggerEscapes.mp4' }
];

// short name so we don't write document.getElementById every time
function $(id) {
  return document.getElementById(id);
}

// run a change that came from the server (turns ignore on, then off after 0.5 sec)
function applyFromServer(change) {
  ignore = true;
  change();
  setTimeout(function() {
    ignore = false;
  }, 500);
}

// ================= HOME SCREEN =================

// if the invite link has ?room=ABCDE, fill in the code box
var params = new URLSearchParams(window.location.search);
if (params.get('room') != null) {
  $('codeInput').value = params.get('room');
}

$('createBtn').onclick = function() {
  socket.emit('create-room', $('nameInput').value);
};

$('joinBtn').onclick = function() {
  socket.emit('join-room', { name: $('nameInput').value, code: $('codeInput').value });
};

socket.on('error-msg', function(message) {
  $('errorText').innerText = message;
});

// the server says we are in the room
socket.on('joined', function(data) {
  $('home').style.display = 'none';
  $('room').style.display = 'block';
  $('roomCode').innerText = data.code;

  video.src = data.video;
  playlist = data.playlist;
  showPlaylist();
  showMovies();
  if (data.poll != null) {
    showPoll(data.poll);
  }

  // late join: jump to the current time (and play if the room is playing)
  applyFromServer(function() {
    video.currentTime = data.time;
    if (data.playing == true) {
      // .catch is needed because browsers can block autoplay
      video.play().catch(function() {});
    }
  });
});

$('copyBtn').onclick = function() {
  var link = window.location.origin + '?room=' + $('roomCode').innerText;
  navigator.clipboard.writeText(link);
  alert('Copied: ' + link);
};

// ================= VIDEO SYNC =================

// when I use the video controls, tell the server (unless it came from the server)
video.onplay = function() {
  if (ignore == false) {
    socket.emit('play', video.currentTime);
  }
};

video.onpause = function() {
  if (ignore == false) {
    socket.emit('pause', video.currentTime);
  }
};

video.onseeked = function() {
  if (ignore == false) {
    socket.emit('seek', video.currentTime);
  }
};

// when the server tells me someone else did something
socket.on('play', function(time) {
  applyFromServer(function() {
    video.currentTime = time;
    video.play().catch(function() {});
  });
});

socket.on('pause', function(time) {
  applyFromServer(function() {
    video.currentTime = time;
    video.pause();
  });
});

socket.on('seek', function(time) {
  applyFromServer(function() {
    video.currentTime = time;
  });
});

socket.on('change-video', function(url) {
  applyFromServer(function() {
    video.src = url;
  });
});

// ================= DRIFT CHECK =================
// every 3 seconds ask the server what the time should be
setInterval(function() {
  if ($('room').style.display == 'block') {
    socket.emit('get-time');
  }
}, 3000);

socket.on('server-time', function(data) {
  var difference = Math.abs(video.currentTime - data.time);
  // only fix it if the video is playing and we are more than 0.5 sec away
  if (data.playing == true && difference > 0.5) {
    applyFromServer(function() {
      video.currentTime = data.time;
    });
  }
});

// ================= MOVIES (category filter + search) =================
function showMovies() {
  var category = $('categorySelect').value;
  var search = $('searchInput').value.toLowerCase();
  var html = '';

  for (var i = 0; i < movies.length; i++) {
    var movie = movies[i];
    var categoryOk = (category == 'All' || category == movie.category);
    var searchOk = movie.title.toLowerCase().includes(search);

    if (categoryOk && searchOk) {
      html = html + '<div class="movie">';
      html = html + '<b>' + movie.title + '</b><br>' + movie.category + '<br>';
      html = html + '<button onclick="playMovie(' + i + ')">Play</button>';
      html = html + '<button onclick="addMovie(' + i + ')">+ Playlist</button>';
      html = html + '</div>';
    }
  }
  $('movieList').innerHTML = html;
}

function playMovie(number) {
  socket.emit('change-video', movies[number].url);
}

function addMovie(number) {
  socket.emit('add-playlist', number);
}

// redo the list every time the search box or category changes
$('searchInput').oninput = showMovies;
$('categorySelect').onchange = showMovies;

// ================= USERS + HOST TRANSFER =================
socket.on('users', function(list) {
  // am I the host?
  var iAmHost = false;
  for (var i = 0; i < list.length; i++) {
    if (list[i].id == socket.id && list[i].isHost == true) {
      iAmHost = true;
    }
  }

  var html = '';
  for (var j = 0; j < list.length; j++) {
    html = html + '<li>' + list[j].name;
    if (list[j].isHost == true) {
      html = html + ' (host)';
    }
    // only the host sees the "Make host" buttons
    if (iAmHost == true && list[j].id != socket.id) {
      html = html + ' <button onclick="makeHost(\'' + list[j].id + '\')">Make host</button>';
    }
    html = html + '</li>';
  }
  $('userList').innerHTML = html;
});

function makeHost(id) {
  socket.emit('transfer-host', id);
}

// ================= CHAT =================
function sendChat() {
  socket.emit('chat', $('chatInput').value);
  $('chatInput').value = '';
}

$('sendBtn').onclick = sendChat;

socket.on('chat', function(data) {
  $('chatBox').innerHTML = $('chatBox').innerHTML + '<p><b>' + data.name + ':</b> ' + data.text + '</p>';
  $('chatBox').scrollTop = $('chatBox').scrollHeight;   // scroll to the newest message
});

// ================= EMOJI REACTIONS =================
var emojiButtons = document.getElementsByClassName('emoji');
for (var i = 0; i < emojiButtons.length; i++) {
  emojiButtons[i].onclick = function() {
    socket.emit('reaction', this.innerText);
  };
}

socket.on('reaction', function(emoji) {
  $('floating').innerText = $('floating').innerText + emoji;
  setTimeout(function() {
    $('floating').innerText = '';
  }, 2000);
});

// ================= PLAYLIST =================
socket.on('playlist', function(list) {
  playlist = list;
  showPlaylist();
});

function showPlaylist() {
  var html = '';
  for (var i = 0; i < playlist.length; i++) {
    html = html + '<li>' + movies[playlist[i]].title + '</li>';
  }
  $('playlist').innerHTML = html;
}

// ================= POLL =================
$('pollBtn').onclick = function() {
  if (playlist.length < 2) {
    alert('Add at least 2 movies to the playlist first');
  } else {
    socket.emit('start-poll', playlist);
  }
};

socket.on('poll', function(poll) {
  showPoll(poll);
});

function showPoll(poll) {
  var html = '';
  for (var i = 0; i < poll.options.length; i++) {
    var title = movies[poll.options[i]].title;
    html = html + '<button onclick="vote(' + i + ')">' + title + ' (' + poll.votes[i] + ')</button>';
  }
  $('pollBox').innerHTML = html;
}

function vote(number) {
  socket.emit('vote', number);
}
