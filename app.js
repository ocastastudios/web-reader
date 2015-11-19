/* global $ */
/*!
 * Electricomics
 * https://github.com/electricomics
 *
/*    
@licstart  The following is the entire license notice for the 
JavaScript below.

Copyright (C) 2015  Electricomics CIC

The JavaScript code in this page is free software: you can
redistribute it and/or modify it under the terms of the GNU
General Public License (GNU GPL) as published by the Free Software
Foundation, either version 3 of the License, or (at your option)
any later version.  The code is distributed WITHOUT ANY WARRANTY;
without even the implied warranty of MERCHANTABILITY or FITNESS
FOR A PARTICULAR PURPOSE.  See the GNU GPL for more details.

As additional permission under GNU GPL version 3 section 7, you
may distribute non-source (e.g., minimized or compacted) forms of
that code without the copy of the GNU GPL normally required by
section 4, provided you include this license notice and a URL
through which recipients can access the Corresponding Source.   


@licend  The above is the entire license notice
for the JavaScript code in this page.
*/

// for debugging purposes
var DEBUG = true;

// npm modules
var nwgui = require('nw.gui');
var win = nwgui.Window.get();
var express = require('express');
var app = express();
var http = require('http');
var path = require('path');
var fs = require('fs');
var exphbs = require('express-handlebars');
var Download = require('download');
var DecompressZip = require('decompress-zip');
var request = require('request');

// settings
var options = {
  host: '127.0.0.1',
  port: 8123
};

// server stuff
var server;
var sockets = {};
var nextSocketId = 0;

if (DEBUG) {
  win.showDevTools();
}
else {
  // win.maximize();
}

// hack to make keyboard shortcuts work (at least under Mac OS)
// https://github.com/nwjs/nw.js/issues/2462
var nativeMenuBar = new nwgui.Menu({ type: 'menubar' });
try {
  nativeMenuBar.createMacBuiltin('Electricomics Web Reader');
  win.menu = nativeMenuBar;
} catch (err) {
  // console.log(err.message);
}

// prevent backspace key from navigating back
// to fix as this jack would block all the back keys, even on input fields
// $(document).on('keydown', function(e) {
//   if (e.keyCode === 8) {
//     e.preventDefault();
//     return false;
//   }
// });

// address of the created server
// the port will be in an advanded setting panel to avoid collision with existent servers
var serverUrl = 'http://' + options.host + ':' + options.port;

// what do we save in local memory for each project?
// id is a unique for the session identifier, formed of:
// a counter, increased for every open project in the session
// plus the name of the open project.
// with session we mean the time during which the app is open.
// when the app is closed and reopen the session restart, so does the counter
// projects[id] = { fsPath, serverPath, name, data }
var projects = {};
var projectsCounter = 0;
var projectExt = '.elcx';
var projectExtReg = new RegExp(projectExt + '$', 'i');
var comics = {};
var library = [];


/**
 * Start the local server
 */
var serverStart = function() {
  //check if server is already running
  http.get(options, function() {
    console.log('server is already running');
    $mainFrame.attr('src', serverUrl + '/home');
  }).on('error', function() {
    //server is not yet running

    // handlebars
    app.set('views', path.join(process.cwd(), 'views'));
    app.engine('.hbs', exphbs({extname: '.hbs'}));
    app.set('view engine', '.hbs');

    app.use(express.static(path.join(process.cwd(), 'public')));
    app.use('/home', function(req, res) {
      var internal = false;
      if (req.headers['user-agent'] === 'elcx-web-reader') {
        internal = true;
      }
      res.render('index', { comics : comics, library: projects, internal: internal });
    });

    // all environments
    app.set('port', options.port);

    server = http.createServer(app);
    server.listen(options.port, function() {
      $mainFrame.attr('src', serverUrl + '/loading.html');
      loadIntComics();
      loadExtComics();
      $mainFrame.load(function() {
        sendMessage('start');
      });
    });

    server.on('connection', function (socket) {
      // Add a newly connected socket
      var socketId = nextSocketId++;
      sockets[socketId] = socket;
      // console.log('socket', socketId, 'opened');

      // Remove the socket when it closes
      socket.on('close', function () {
        // console.log('socket', socketId, 'closed');
        delete sockets[socketId];
      });
    });
  });
};


/**
 * Load all internal comics
 */
var loadIntComics = function() {
  var comicsPath = path.join(process.cwd(), 'comics');

  if (!exists(comicsPath)) {
    return false;
  }

  var comicsDir = fs.readdirSync(comicsPath);
  var fsPath;

  for (var i = 0; i < comicsDir.length; i++) {
    fsPath = path.join(comicsPath, comicsDir[i]);
    addComicInt(fsPath);
  }
};


/**
 * Add comic from the proprietary folder in the app
 * @param {string} fsPath - Filesystem path of the archive
 * @returns {boolean} true if import was successful
 */
var addComicInt = function(fsPath) {
  var comicJson = path.join(fsPath, 'comic.json');
  var comicData;
  
  if (!exists(comicJson)) {
    return false;
  }
  try {
    comicData = JSON.parse(fs.readFileSync(comicJson));
  }
  catch(e) {
    return false;
  }

  var id = comicData.slug;
  var serverPath = '/' + id;
  
  comics[id] = {
    fsPath: fsPath,
    serverPath: serverPath,
    name: id,
    data: comicData
  };
  app.use(serverPath, express.static(fsPath));
};


/**
 * Load all external comics
 */
var loadExtComics = function() {
  var localComics;
  var fsPath;

  try {
    localComics = JSON.parse(localStorage.getItem('library')) || [];
  }
  catch (e) {
    localComics = [];
  }
  for (var i = 0; i < localComics.length; i++) {
    fsPath = localComics[i];
    addComicFolder(fsPath);
  }
};


/**
 * Add comic from folder
 * @param {string} fsPath - Filesystem path of the folder
 * @returns {boolean} true if import was successful
 */
var addComicFolder = function(fsPath) {
  var comicJson = path.join(fsPath, 'comic.json');
  var comicData;

  if (library.indexOf(fsPath) !== -1) {
    sendMessage('error', { message: 'Comic in folder <em>' + fsPath + '</em> is already loaded.' });
    return false;
  }
  if (!exists(fsPath)) {
    sendMessage('error', { message: 'Folder <em>' + fsPath + '</em> not found.' });
    return false;
  }
  if (!exists(comicJson)) {
    sendMessage('error', { message: 'Folder <em>' + comicJson + '</em> not found.' });
    return false;
  }
  try {
    comicData = JSON.parse(fs.readFileSync(comicJson));
  }
  catch(e) {
    sendMessage('error', { message: 'Impossible to read file <em>' + comicJson + '</em>.' });
    return false;
  }

  projectsCounter++;
  var name = 'ext';
  var id = projectsCounter + '-' + name;
  var serverPath = '/' + id;
  
  projects[id] = {
    fsPath: fsPath,
    serverPath: serverPath,
    name: name,
    data: comicData
  };
  app.use(serverPath, express.static(fsPath));
  library.push(fsPath);
  localStorage.setItem('library', JSON.stringify(library));
  return true;
};


/**
 * Add comic from archive file
 * @param {string} fsPath - Filesystem path of the archive
 */
var addComicArchive = function(fsPath) {
  if (!projectExtReg.test(fsPath)) {
    sendMessage('error', { message: 'File must be an <em>.elcx</em> archive.' });
    return false;
  }
  var dest = fsPath.replace(projectExtReg, '');
  var unzipper = new DecompressZip(fsPath);

  unzipper.on('error', function(err) {
    sendMessage('error', { message: 'Impossible to extract file <em>' + fsPath + '</em>.<br>Error: <pre>' + err + '</pre>' });
  });

  unzipper.on('extract', function() {
    addComicFolder(dest);
  });

  // unzipper.on('progress', function(index, count) {
  // });

  unzipper.extract({
    path: dest,
    filter: function(file) {
      return file.type !== 'SymbolicLink';
    }
  });
};


/**
 * Add comic from remote url
 * We have to expand the url to get the proper final file name
 * Example from http://www.2ality.com/2012/04/expand-urls.html 
 * @param {string} url - http/https url to download the archive from
 * @param {string} fsPath - Filesystem path where do download and extract the archive
 */
var addComicUrl = function(url, dest) {
  request({ method: 'HEAD', url: url, followAllRedirects: true }, function (err, response) {
    if (err) {
      sendMessage('error', { message: 'Impossible to download from <em>' + url + '</em>.<br>Error: <pre>' + err + '</pre>' });
      return false;
    }
    var longUrl = response.request.href;
    new Download().get(longUrl).dest(dest).use(downloadStatus).run(function(err, files) {
      if (err) {
        sendMessage('error', { message: 'Impossible to download from <em>' + longUrl + '</em>.<br>Error: <pre>' + err + '</pre>' });
        return false;
      }
      for (var i = 0; i < files.length; i++) {
        addComicArchive(path.join(files[i].history[1]));
      }
    });
  });
};


/*
 * Check if file or directory exists
 * @param {string} fsPath - Path in the filesystem to test
 * @returns {boolean} true if it exists
 */
var exists = function(fsPath) {
  try {
    fs.statSync(fsPath);
    return true;
  }
  catch (e) {
    return false;
  }
};


/**
 * Send a message to the iframe
 * Communications between the app container (which runs under file://) and the pages in the local server (which runs under http://) can ben done only through window.postMessage (a method that enables cross-origin communication)
 * @param {string} type - Type of the message
 */
var sendMessage = function(type, obj) {
  var msg = {
    type: type
  };
  $.extend(msg, obj);
  $mainFrame.get(0).contentWindow.postMessage(JSON.stringify(msg), serverUrl);
};


/**
 * Progress of the download
 * @param {object} res - response data
 * @param {string} url - url we are downloading from
 * @param {function} cb - Callback when download is completed
 */
var downloadStatus = function(res, url, cb) {
  if (!res.headers['content-length']) {
    cb();
    return false;
  }

  var total = parseInt(res.headers['content-length'], 10);
  var totalPerc = 100 / total;
  var current = 0;
  var currentPerc = 0;
  var prevCurrentPerc;
  res.on('data', function(data) {
    current += data.length;
    currentPerc = parseInt(current * totalPerc, 10);
    if (currentPerc !== prevCurrentPerc) {
      prevCurrentPerc = currentPerc;
      console.log(currentPerc + '%');
    }
  });
  res.on('end', function() {
    console.log('done');
    cb();
  });
};


// Listener for the postMessages from the iframes
window.addEventListener('message', function(e) {
  // check that that the messages come from our local server
  if (e.origin !== serverUrl) {
    return false;
  }
  
  var msg;
  try {
    msg = JSON.parse(e.data);
  } catch(err) {
    console.log('error in the received post message');
    return false;
  }

  if (msg.type === 'local-folder') {
    addComicFolder(msg.path);
  }

  if (msg.type === 'local-archive') {
    addComicArchive(msg.path);
  }

  if (msg.type === 'url') {
    addComicUrl(msg.url, msg.path);
  }
}, false);



// UI
// var $quit = $('#quit');
var $mainFrame = $('#main-iframe');


// $quit.on('click', function() {
//   var confirm = $('#dialog-close-app').dialog({
//     resizable: false,
//     modal: true,
//     width: 550,
//     buttons: {
//       'Quit': function() {
//         $(this).dialog('close');
//         win.close();
//       },
//       Cancel: function() {
//         $(this).dialog('close');
//         return;
//       }
//     }
//   });
//   confirm.dialog('open');
// });

// use the close event to catch every type of closing, not only the one from our
// top menu (e.g. keyboard shortcut close)
win.on('close', function() {
  this.hide(); // Pretend to be closed already
  this.close(true);
});





serverStart();
