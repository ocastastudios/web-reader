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
var fs = require('fs-extra');
var exphbs = require('express-handlebars');
var Download = require('download');
var connectInject = require('connect-inject');
var osenv = require('osenv');
var Q = require('q');
var junk = require('junk');
var S = require('string');
var tools = require('./lib/tools');
var Store = require('./lib/store');

// settings
// they may end up in the advanced setting panel
var options = {
  host: '127.0.0.1',
  port: 8123,
  dir: 'Electricomics Library',
  ext: '.elcx',
  storeUrl: 'http://localhost:8000'
};

var HOME_DIR = osenv.home();
// var TMP_DIR = osenv.tmpdir();
var TMP_DIR = path.join(HOME_DIR, 'Desktop');
var LIB_DIR = path.join(HOME_DIR, options.dir);

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

// clear cache
nwgui.App.clearCache();

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

var serverUrl = 'http://' + options.host + ':' + options.port;
var projects = {};
var projectExt = options.ext;
var comicSnippet = '<ec-webreader-nav style="display:block;position:absolute;background:red;top:0;z-index:1;"><a href="/index">HOME</a></ec-webreader-nav>';
var $mainFrame = $('#main-iframe');
var iframeWin = $mainFrame.get(0).contentWindow;
var promisesLoadComics = [];
var downloadStream;
var downloadStreamInterrupted = false;
var store;

var hbs = exphbs.create({
  extname: '.hbs',
  helpers: {
    breaklines: function(text) {
      text = hbs.handlebars.Utils.escapeExpression(text);
      text = text.replace(/(\r\n|\n|\r)/gm, '<br>');
      return new hbs.handlebars.SafeString(text);
    },
    rawpartial: function(partialName) {
      var file = path.join(process.cwd(), hbs.partialsDir, partialName + hbs.extname);
      var template = fs.readFileSync(file, 'utf8');
      return template;
    },
    eq: function(a, b, options) {
      return a === b ? options.fn(this) : options.inverse(this);
    },
    json: function(context) {
      return JSON.stringify(context);
    }
  }
});


/**
 * Start the local server
 */
var serverStart = function() {
  //check if server is already running
  http.get(options, function() {
    console.log('server is already running');
    init();
  }).on('error', function() {
    //server is not yet running

    // handlebars
    app.set('views', path.join(process.cwd(), 'views'));
    app.engine('.hbs', hbs.engine);
    app.set('view engine', '.hbs');

    // assets
    app.use(express.static(path.join(process.cwd(), 'public')));
    // app
    app.use('/index', function(req, res) {
      var internal = tools.isInternal(req);
      res.render('app', {
        library: projects,
        store: store.data,
        added: projects,
        internal: true
      });
    });
    // ajax item
    app.use('/item', function(req, res) {
      var id = req.query.id;
      var library = {};
      library[id] = projects[id];
      var internal = tools.isInternal(req);
      res.render('item', {
        layout: false,
        library: library,
        internal: internal
      });
    });

    // all environments
    app.set('port', options.port);

    server = http.createServer(app);
    server.listen(options.port, function() {
      init();
    });

    server.on('connection', function(socket) {
      // Add a newly connected socket
      var socketId = nextSocketId++;
      sockets[socketId] = socket;
      // console.log('socket', socketId, 'opened');

      // Remove the socket when it closes
      socket.on('close', function() {
        // console.log('socket', socketId, 'closed');
        delete sockets[socketId];
      });
    });
  });
};


/**
 * Load all external comics
 */
var loadExtComics = function() {
  var comicsPath = LIB_DIR;

  if (!tools.exists(comicsPath)) {
    return false;
  }
  
  var comicsDir = fs.readdirSync(comicsPath);
  comicsDir = comicsDir.filter(junk.not);
  var fsPath;

  for (var i = 0; i < comicsDir.length; i++) {
    fsPath = path.join(comicsPath, comicsDir[i]);
    promisesLoadComics.push(readComicFolder(fsPath));
  }
};


/**
 * Read comic from folder
 * @param {string} fsPath - Filesystem path of the folder
 */
var readComicFolder = function(fsPath) {
  return readComicJson(fsPath)
    .then(function(res) {
      var entry = addEntry(res, fsPath);
      projects[entry.id] = entry.o;
    }, function(err) {
      console.error(err);
    });
};


/**
 * Add entry
 * @param {object} comicData - JSON comic data
 * @param {string} fsPath - Filesystem path of the comic folder
 * @returns {string} Name of the comic folder
 */
var addEntry = function(comicData, fsPath) {
  var id = path.basename(fsPath);
  var serverPath = '/' + id;
  
  var obj = {
    fsPath: fsPath,
    serverPath: serverPath,
    name: id,
    data: comicData
  };
  app.get(serverPath + '/', persConnectInject);
  app.use(serverPath, express.static(fsPath));
  return { id: id, o: obj };
};


/**
 * Personalized version of connectInject
 */
var persConnectInject = function(req, res, next) {
  var originalUrl = req.originalUrl.replace(/\//ig, '');
  var entry = projects[originalUrl];
  if (!entry) {
    return next();
  }
  var internal = tools.isInternal(req);
  var snip = comicSnippet + '<div>' + internal + '</div>';
  return connectInject({
    rules: [{
      snippet: snip,
      match: /<\/body>/,
      fn: function(w, s) {
        return s + w;
      }
    }]
  })(req, res, next);
};


/**
 * Download file
 * @param {string} url - URL to download
 * @param {string} dest - Destination folder
 * @param {string} newName - Rename file to this - optional
 * @returns {string} Filesystem path of the downloaded file
 */
var downloadFile = function(url, dest, newName) {
  var deferred = Q.defer();
  new Download().get(url).dest(dest).rename(newName).use(downloadStatus).run(function(err, files) {
    if (err) {
      deferred.reject(err);
    }
    else {
      if (!downloadStreamInterrupted) {
        deferred.resolve(files[0].history[ files[0].history.length - 1 ]);
      }
      else {
        downloadStreamInterrupted = false;
        deferred.reject(new Error('Download interrupted'));
      }
    }
  });
  return deferred.promise;
};


/**
 * Read comic.json file
 * @param {string} fsPath - Filesystem path of the folder where the file is
 * @returns {object} content in json format of the file
 */
var readComicJson = function(fsPath) {
  var file = path.join(fsPath, 'comic.json');
  return tools.readJson(file);
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
  iframeWin.postMessage(JSON.stringify(msg), serverUrl);
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
  sendMessage('download-started', { message: tools.formatBytes(total) });
  res.on('data', function(data) {
    current += data.length;
    currentPerc = parseInt(current * totalPerc, 10);
    if (currentPerc !== prevCurrentPerc) {
      prevCurrentPerc = currentPerc;
      sendMessage('progress-url', { message: currentPerc });
    }
  });
  res.on('end', function() {
    if (!downloadStreamInterrupted) {
      // send progressbar complete
      sendMessage('progress-url', { message: 100 });
    }
    else {
      // send progressbar error
      sendMessage('progress-url', { message: -1 });
    }
    cb();
  });
  res.on('interrupt', function() {
    downloadStreamInterrupted = true;
    res.destroy();
  });
  downloadStream = res;
};


/**
 * Open library comic in external browser
 * @param {string} id - comic id
 */
var openExt = function(id) {
  if (!projects[id]) {
    return false;
  }
  nwgui.Shell.openExternal(serverUrl + projects[id].serverPath);
};


/**
 * Open comic folder in the system finder
 * @param {string} id - comic id
 */
var openFolder = function(id) {
  if (!projects[id]) {
    return false;
  }
  nwgui.Shell.showItemInFolder(path.join(projects[id].fsPath, 'index.html'));
};


/**
 * Remove entry and its files from the library
 * @param {string} id - comic id
 */
var removeEntry = function(id) {
  if (!projects[id]) {
    sendMessage('error', { message: 'Project <code>' + id + '</code> not found' });
    return false;
  }
  var fsPath = projects[id].fsPath;

  return tools.removeFiles(fsPath)
    .then(function() {
      delete projects[id];
      sendMessage('deleted', { id: id });
    }, function(err) {
      sendMessage('error', { message: err.message });
    });
};


/**
 * Import comic from url
 * @param {string} url - URL to download
 */
var pAddComicUrl = function(url) {
  var myUrl = tools.addhttp(url);
  var tmpName = Date.now() + '';
  var newName = tmpName + projectExt;
  var archive = path.join(TMP_DIR, newName);

  sendMessage('import', { message: 'started' });

  return downloadFile(myUrl, TMP_DIR, newName)
    .then(pAddComicArchive,
  // handle errors
    function(err) {
      // delete tmp files and folders
      // we are checking they exist because it depends on when the error was fired
      if (tools.exists(archive)) {
        tools.removeFiles(archive);
      }
      sendMessage('error', { message: err.message });
      sendMessage('import', { message: 'error' });
    });
};


/**
 * Import comic from local folder
 * @param {string} fsPath - Filesystem path of the folder
 */
// var pAddComicFolder = function(fsPath) {
//   var tmpName = Date.now() + '';
//   var newName = tmpName + projectExt;
//   var tmpPath = path.join(TMP_DIR, newName);

//   sendMessage('import', { message: 'started' });

//   return tools.zipFolder(fsPath, tmpPath)
//     .then(pAddComicArchive,
//   // handle errors
//     function(err) {
//       // delete tmp files and folders
//       // we are checking they exist because it depends on when the error was fired
//       if (tools.exists(tmpPath)) {
//         tools.removeFiles(tmpPath);
//       }
//       sendMessage('error', { message: err.message });
//       sendMessage('import', { message: 'error' });
//     });
// };


/**
 * Import comic from local archive - for the UI
 * @param {string} archive - Filesystem path of the archive
 */
var pAddComicElcx = function(archive) {
  var tmpName = Date.now() + '';
  var newName = tmpName + projectExt;
  var tmpPath = path.join(TMP_DIR, newName);

  sendMessage('import', { message: 'started' });

  return tools.copyFs(archive, tmpPath)
    .then(pAddComicArchive,
  // handle errors
    function(err) {
      // delete tmp files and folders
      // we are checking they exist because it depends on when the error was fired
      if (tools.exists(tmpPath)) {
        tools.removeFiles(tmpPath);
      }
      sendMessage('error', { message: err.message });
      sendMessage('import', { message: 'error' });
    });
};


/**
 * Import comic from archive
 * @param {string} archive - Filesystem path of the archive
 */
var pAddComicArchive = function(archive) {
  var tmpName = path.basename(archive, projectExt);
  var tmpPath = path.join(TMP_DIR, tmpName);
  var checksum;
  var comicJson;
  var slug;
  var fsPath;

  sendMessage('import', { message: 'started' });

  // checksum file
  return tools.checksumFile(archive)
  // unzip file in tmp dir
    .then(function(res) {
      checksum = res;
      return tools.unzipFile(archive, tmpPath);
    })
  // delete tmp archive
    .then(function() {
      return tools.removeFiles(archive);
    })
  // read comic.json
    .then(function() {
      return readComicJson(tmpPath);
    })
  // create slug and move folder in library
    .then(function(res) {
      comicJson = res;
      slug = S(comicJson.title).slugify().s + '_' + checksum;
      fsPath = path.join(LIB_DIR, slug);
      return tools.moveFolder(tmpPath, fsPath);
    })
  // add entry
    .then(function() {
      var entry = addEntry(comicJson, fsPath);
      projects[entry.id] = entry.o;
      // tell to load data in UI page
      sendMessage('add-item', { id: entry.id });
      sendMessage('import', { message: 'completed' });
    },
  // handle errors
    function(err) {
      // delete tmp files and folders
      // we are checking they exist because it depends on when the error was fired
      if (tools.exists(archive)) {
        tools.removeFiles(archive);
      }
      if (tools.exists(tmpPath)) {
        tools.removeFiles(tmpPath);
      }
      sendMessage('error', { message: err.message });
      sendMessage('import', { message: 'error' });
    });
};


/**
 * Check if online
 * @returns {boolean} True if online
 */
var isOnline = function() {
  return tools.checkOnline()
    .then(function(res) {
      sendMessage('online', { status: res });
      return res;
    },
    function(err) {
      sendMessage('online', { status: false });
      return err;
    });
};
window.addEventListener('offline', function() {
  isOnline();
});
window.addEventListener('online', function() {
  isOnline();
});


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

  // if (msg.type === 'local-folder') {
  //   pAddComicFolder(msg.path);
  // }

  if (msg.type === 'local-archive') {
    pAddComicElcx(msg.path);
  }

  if (msg.type === 'url') {
    pAddComicUrl(msg.url);
  }

  if (msg.type === 'open-ext') {
    openExt(msg.id);
  }

  if (msg.type === 'open-folder') {
    openFolder(msg.id);
  }

  if (msg.type === 'remove-entry') {
    removeEntry(msg.id);
  }

  if (msg.type === 'interrupt') {
    downloadStream.emit('interrupt');
  }

  if (msg.type === 'online') {
    isOnline();
  }
}, false);


/**
 * Confirm before closing the app
 */
var dialogClose = function() {
  var confirm = $('#dialog-close-app').dialog({
    resizable: false,
    modal: true,
    width: 550,
    buttons: {
      'Quit': function() {
        $(this).dialog('close');
        win.hide();
        win.close(true);
      },
      Cancel: function() {
        $(this).dialog('close');
        return;
      }
    }
  });
  confirm.dialog('open');
};


// use the close event to catch every type of closing
win.on('close', function() {
  dialogClose();
});


/**
 * Start and show
 */
var init = function() {
  $mainFrame.attr('src', serverUrl + '/loading.html');
  store = new Store(options.storeUrl);
  loadExtComics();
  return Q.all(promisesLoadComics)
    .then(function() {
      $mainFrame.load(function() {
        $mainFrame.css('opacity', '1');
        sendMessage('start');
      });
    });
};


serverStart();
