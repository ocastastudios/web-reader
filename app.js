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
var dataJson = require('./data.json');

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
  nativeMenuBar.createMacBuiltin('Electricomics Generator');
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
      $mainFrame.attr('src', serverUrl + '/splashscreen.html');
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
  var dataComics = dataJson.comics;
  var localComics = JSON.parse(localStorage.getItem('comics') || '{}');
  var id;
  var str;
  var obj;
  var fsPath;
  var serverPath;
  for (var i = 0; i < dataComics.length; i++) {
    id = dataComics[i].slug;
    fsPath = path.join(process.cwd(), 'comics', id);
    serverPath = '/' + id;
    // if we already have that comic and that version, load localstorage data
    if (localComics.hasOwnProperty(id) &&
      dataComics[i].version === localComics[id].data.version) {
      comics[id] = localComics[id];
      app.use(serverPath, express.static(fsPath));
    }
    // otherwise load from its own comic.json
    else {
      str = fs.readFileSync(path.join(fsPath, 'comic.json'));
      try {
        obj = JSON.parse(str);
        comics[id] = {
          fsPath: fsPath,
          serverPath: serverPath,
          name: id,
          data: obj
        };
        app.use(serverPath, express.static(fsPath));
      }
      catch (e) {
        // do nothing
      }
    }
  }
  localStorage.setItem('comics', JSON.stringify(comics));
};


/**
 * Load all external comics
 */
var loadExtComics = function() {
  var localComics;
  try {
    localComics = JSON.parse(localStorage.getItem('library'));
  }
  catch (e) {
    localComics = {};
  }
  for (var p in localComics) {
    if (localComics.hasOwnProperty(p)) {
      addIntComic(localComics[p].fsPath, localComics[p].name);

      fs.stat(localComics[p].fsPath, function(err) {
        if (err == null) {
          // folder exists
          return ok(localComics[p]);
        }
        else if (err.code === 'ENOENT') {
          // folder does not exist
          return ko();
        }
        else {
          // some other error that we threat as if folder exists
          return ok(localComics[p]);
        }
      });
    }
  }

  var ko = function() {
    localStorage.setItem('library', JSON.stringify(projects));
  };

  var ok = function(obj) {
    addComic(obj.fsPath, obj.name, obj.data);
  };
};


/**
 * Add comic from url
 * @param {string} url - Where to download the comic from
 * @param {string} fsPath - Path in the filesystem where to download the comic
 */
var addUrlComic = function(url, fsPath) {
  new Download({extract: true})
    .get(url, fsPath)
    .run( function(err, files) {
      if (err) {
        return false;
      }
      var name = '';
      addIntComic(fsPath, name);
      return true;
    });
};


/**
 * Add comic from folder
 * @param {string} fsPath - Path in the filesystem of the comic
 */
var addIntComic = function(fsPath, name) {
  var jPath = path.join(fsPath, 'comic.json');

  fs.stat(jPath, function(err) {
    if (err == null) {
      // file exists
      return ok();
    }
    else if (err.code === 'ENOENT') {
      // file does not exist
      return ko();
    }
    else {
      // some other error that we threat as if file exists
      return ok();
    }
  });

  var ko = function() {
    return false;
  };

  var ok = function() {
    var str = fs.readFileSync(jPath);
    var obj;
    try {
      obj = JSON.parse(str);
      addComic(fsPath, name, obj);
    }
    catch (e) {
      return false;
    }
  };
};


/**
 * Add comic
 * @param {string} fsPath - Path in the filesystem of the comic
 * @param {string} name - Slug of the comic
 * @param {object} obj - Data from comic.json
 * @returns {string} session id of the comic
 */
var addComic = function(fsPath, name, obj) {
  projectsCounter++;
  var id = projectsCounter + '-' + name;
  projects[id] = {
    name: name,
    fsPath: fsPath,
    serverPath: '/' + id,
    data: obj
  };
  app.use('/' + id, express.static(fsPath));
  localStorage.setItem('library', JSON.stringify(projects));
  return id;
};


/**
 *
 */
var addFolderUI = function(fsPath, name) {
  var str;
  var obj;
  var id;
  var jPath = path.join(fsPath, 'comic.json');
  if (!exists(jPath)) {
    // no comic.json in the folder
    sendMessage('error', { message: 'File <em>' + jPath + '</em> not found.' });
    return false;
  }
  str = fs.readFileSync(jPath);
  try {
    obj = JSON.parse(str);
  }
  catch (e) {
    // impossible to read comic.json correctly
    sendMessage('error', { message: 'Impossible to read file <em>' + jPath + '</em>.' });
    return false;
  }
  id = addComic(fsPath, name, obj);
  sendMessage('library', { item: projects[id] });
  // // check if we already have this comic in memory
  // for (var p in projects) {
  //   if (projects.hasOwnProperty(p)) {
  //     if (projects[p].fsPath === fsPath) {
  //       // if we already have this comic, check version
  //       if (obj.version <= projects[p].data.version) {
  //         // if the version we try to upload is older or equal the one we
  //         // already have, ask what to do
  //         sendMessage('error', { message: 'It seems like the version of <em>' + fsPath + '</em> you are trying to load is older than the current available one. Are you sure you want to overwrite it?' });
  //         // todo the answer to this
  //       }
  //       else {
  //         // if the version we try to upload is newer, take it
  //         addComic(fsPath, name, obj);
  //       }
  //     }
  //   }
  // }
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

  if (msg.type === 'local') {
    addFolderUI(msg.path, msg.name);
  }

  if (msg.type === 'url') {
    addUrlComic(msg.url, msg.path);
  }
}, false);



// UI
var $quit = $('#quit');
var $mainFrame = $('#main-iframe');


$quit.on('click', function() {
  var confirm = $('#dialog-close-app').dialog({
    resizable: false,
    modal: true,
    width: 550,
    buttons: {
      'Quit': function() {
        $(this).dialog('close');
        win.close();
      },
      Cancel: function() {
        $(this).dialog('close');
        return;
      }
    }
  });
  confirm.dialog('open');
});

// use the close event to catch every type of closing, not only the one from our
// top menu (e.g. keyboard shortcut close)
win.on('close', function() {
  this.hide(); // Pretend to be closed already
  this.close(true);
});





serverStart();
