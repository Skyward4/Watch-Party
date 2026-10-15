var socket = io();   
var video = document.getElementById('video');
var playlist = [];   


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
function $(id) {
  return document.getElementById(id);
}


function applyFromServer(change) {
  ignore = true;
  change();
  setTimeout(function() {
    ignore = false;
  }, 500);
}
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
  applyFromServer(function() {
    video.currentTime = data.time;
    if (data.playing == true) {
      video.play().catch(function() {});
    }
  });
});

$('copyBtn').onclick = function() {
  var link = window.location.origin + '?room=' + $('roomCode').innerText;
  navigator.clipboard.writeText(link);
  alert('Copied: ' + link);
};
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
setInterval(function() {
  if ($('room').style.display == 'block') {
    socket.emit('get-time');
  }
}, 3000);

socket.on('server-time', function(data) {
  var difference = Math.abs(video.currentTime - data.time);
  if (data.playing == true && difference > 0.5) {
    applyFromServer(function() {
      video.currentTime = data.time;
    });
  }
});
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


$('searchInput').oninput = showMovies;
$('categorySelect').onchange = showMovies;


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


function sendChat() {
  socket.emit('chat', $('chatInput').value);
  $('chatInput').value = '';
}

$('sendBtn').onclick = sendChat;

socket.on('chat', function(data) {
  $('chatBox').innerHTML = $('chatBox').innerHTML + '<p><b>' + data.name + ':</b> ' + data.text + '</p>';
  $('chatBox').scrollTop = $('chatBox').scrollHeight;   // scroll to the newest message
});


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
