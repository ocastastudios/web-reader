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
var connectInject = require('connect-inject');
var checksum = require('checksum');
var osenv = require('osenv');
var Q = require('q');
var mv = require('mv');
var archiver = require('archiver');
var junk = require('junk');
var S = require('string');
var rmdir = require('rmdir');
var request = require('request');
var isOnline = require('is-online');

// settings
// they may end up in the advanced setting panel
var options = {
  host: '127.0.0.1',
  port: 8123,
  dir: 'Electricomics Library',
  ext: '.elcx'
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
var comics = {};
var comicSnippet = '<ec-webreader-nav style="display:block;position:absolute;background:red;top:0;z-index:1;"><a href="/home">HOME</a></ec-webreader-nav>';
var $mainFrame = $('#main-iframe');
var iframeWin = $mainFrame.get(0).contentWindow;
var promisesLoadComics = [];
var downloadStream;
var downloadStreamInterrupted = false;

var hbs = exphbs.create({
  extname: '.hbs',
  helpers: {
    breaklines: function(text) {
      text = hbs.handlebars.Utils.escapeExpression(text);
      text = text.replace(/(\r\n|\n|\r)/gm, '<br>');
      return new hbs.handlebars.SafeString(text);
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

    app.use(express.static(path.join(process.cwd(), 'public')));
    app.use('/home', function(req, res) {
      var internal = false;
      if (req.headers['user-agent'] === 'elcx-web-reader') {
        internal = true;
      }
      res.render('index', { comics : comics, library: projects, internal: internal });
    });

    app.use('/item', function(req, res) {
      var id = req.query.id;
      var library = {};
      library[id] = projects[id];
      var internal = false;
      if (req.headers['user-agent'] === 'elcx-web-reader') {
        internal = true;
      }
      res.render('item', { library: library, internal: internal });
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
 * Load all internal comics
 */
var loadIntComics = function() {
  var comicsPath = path.join(process.cwd(), 'comics');

  if (!exists(comicsPath)) {
    return false;
  }

  var comicsDir = fs.readdirSync(comicsPath);
  comicsDir = comicsDir.filter(junk.not);
  var fsPath;

  for (var i = 0; i < comicsDir.length; i++) {
    fsPath = path.join(comicsPath, comicsDir[i]);
    promisesLoadComics.push(readComicInt(fsPath));
  }
};


/**
 * Add comic from the proprietary folder in the app
 * @param {string} fsPath - Filesystem path of the archive
 */
var readComicInt = function(fsPath) {
  return readComicJson(fsPath)
    .then(function(res) {
      var entry = addEntry(res, fsPath);
      comics[entry.id] = entry.o;
    }, function(err) {
      sendMessage('error', { message: err.message });
    });
};


/**
 * Load all external comics
 */
var loadExtComics = function() {
  var comicsPath = LIB_DIR;

  if (!exists(comicsPath)) {
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
      sendMessage('error', { message: err.message });
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
  app.get(serverPath + '/', connectInject({
    snippet: comicSnippet,
    rules: [{
      match: /<\/body>/,
      fn: function(w, s) {
        return s + w;
      }
    }]
  }));
  app.use(serverPath, express.static(fsPath));
  return { id: id, o: obj };
};


/**
 * Zip folder
 * @param {string} source - Filesystem path of the folder
 * @param {string} dest - Filesystem path of the archive, its name included
 * @returns {string} Filesystem path of the archive, its name included
 */
var zipFolder = function(source, dest) {
  var deferred = Q.defer();

  var output = fs.createWriteStream(dest);
  var zipArchive = archiver('zip');
  output.on('close', function() {
    deferred.resolve(dest);
  });
  zipArchive.pipe(output);
  zipArchive.bulk([
    { src: [ '**/*' ], cwd: source, expand: true }
  ]);
  zipArchive.finalize(function(err) {
    if (err) {
      deferred.reject(err);
    }
  });

  return deferred.promise;
};


/**
 * Unzip file
 * @param {string} archive - Filesystem path of the file
 * @param {string} dest - Filesystem path where to extract files
 * @returns {string} Filesystem path of the extracted files
 */
var unzipFile = function(archive, dest) {
  var deferred = Q.defer();
  var unzipper = new DecompressZip(archive);

  unzipper.on('error', function(err) {
    deferred.reject(err);
  });

  unzipper.on('extract', function() {
    deferred.resolve(dest);
  });

  // unzipper.on('progress', function(index, count) {
  // });

  unzipper.extract({
    path: dest,
    filter: function(file) {
      return file.type !== 'SymbolicLink';
    }
  });

  return deferred.promise;
};


/**
 * Resolve url
 * We have to expand the url to get the proper final file name
 * Or if we want an error when the url doesn't exist
 * Example from http://www.2ality.com/2012/04/expand-urls.html 
 * @param {string} url - URL to download
 * @returns {string} Resolved url
 */
var resolveUrl = function(url) {
  var deferred = Q.defer();
  request({ method: 'HEAD', url: url, followAllRedirects: true }, function (err, response) {
    if (err) {
      deferred.reject(err);
    }
    else {
      if (response.statusCode === 404) {
        deferred.reject(new Error('404 Error File Not Found'));
      }
      else {
        deferred.resolve(response.request.href);
      }
    }
  });
  return deferred.promise;
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
  var rename = function(name) {
    if (newName != null && newName !== '') {
      return newName;
    }
    else {
      return name;
    }
  };
  new Download().get(url).dest(dest).rename(rename(name)).use(downloadStatus).run(function(err, files) {
    if (err) {
      deferred.reject(err);
    }
    else {
      if (!downloadStreamInterrupted) {
        deferred.resolve(files[0].history[2]);
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
 * Create sha1 checksum of the file
 * @param {string} file - Filesystem path of the file
 * @returns {string} checksum
 */
var checksumFile = Q.denodeify(checksum.file);


/**
 * Check if the internet connection is up
 * We'll need it when interfacing with the online comic library
 * @returns {boolean} True if online
 */
var checkOnline = Q.denodeify(isOnline);


/**
 * Remove all files in the given path recursively
 * @param {string} fsPath
 * @returns {object} dirs: array of removed dirs, files: array of removed files
 */
var removeFiles = function(fsPath) {
  var deferred = Q.defer();
  rmdir(fsPath, function(err, dirs, files) {
    if (err) {
      deferred.reject(err);
    }
    else {
      var res = {
        dirs: dirs,
        files: files
      };
      deferred.resolve(res);
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
  var deferred = Q.defer();
  var obj;
  fs.readFile(file, function(err, data) {
    if (err) {
      deferred.reject(err);
    }
    else {
      try {
        obj = JSON.parse(data);
         deferred.resolve(obj);
      }
      catch(e) {
        deferred.reject(e);
      }
    }
  });
  return deferred.promise;
};


/**
 * Move and rename folder
 * @param {string} source - Filesystem path of the folder to move
 * @param {string} dest - Filesystem path where to move the folder to
 * @returns {string} Filesystem path of the destination
 */
var moveFolder = function(source, dest) {
  var deferred = Q.defer();
  // mkdirp: creates all the necessary directories
  // clobber: if dest exists, an error is returned
  mv(source, dest, { mkdirp: true, clobber: false }, function(err) {
    if (err) {
      deferred.reject(err);
    }
    else {
      deferred.resolve(dest);
    }
  });
  return deferred.promise;
};


/**
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
  iframeWin.postMessage(JSON.stringify(msg), serverUrl);
};


/**
 * Convert size in bytes to KB, MB, GB
 * from http://stackoverflow.com/a/18650828/471720
 * @param {number} bytes - Int number of bytes
 * @param {number} decimals - Number of decimals to show - not required
 * @returns {string} Formatted value
 */
var formatBytes = function(bytes, decimals) {
  if (bytes === 0) {
    return '0 Byte';
  }
  var k = 1024;
  // on Mac OS X use this
  // http://www.macworld.com/article/1142471/snow_leopard_math.html
  if (process.platform === 'darwin') {
    k = 1000;
  }
  var dm = decimals + 1 || 3;
  var sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
  var i = Math.floor(Math.log(bytes) / Math.log(k));
  return (bytes / Math.pow(k, i)).toPrecision(dm) + ' ' + sizes[i];
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
  sendMessage('download-started', { message: formatBytes(total) });
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
 * Open internal comic in external browser
 * @param {string} id - comic id
 */
var openInt = function(id) {
  if (!comics[id]) {
    return false;
  }
  nwgui.Shell.openExternal(serverUrl + comics[id].serverPath);
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

  return removeFiles(fsPath)
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
  var tmpName = Date.now() + '';
  var newName = tmpName + projectExt;
  var archive = path.join(TMP_DIR, newName);

  return resolveUrl(url)
    .then(function(res) {
      var resolvedUrl = res;
      return downloadFile(resolvedUrl, TMP_DIR, newName);
    })
    .then(pAddComicArchive,
  // handle errors
    function(err) {
      // delete tmp files and folders
      // we are checking they exist because it depends on when the error was fired
      if (exists(archive)) {
        removeFiles(archive);
      }
      sendMessage('error', { message: err.message });
    });
};


/**
 * Import comic from local folder
 * @param {string} fsPath - Filesystem path of the folder
 */
var pAddComicFolder = function(fsPath) {
  var tmpName = Date.now() + '';
  var newName = tmpName + projectExt;
  var tmpPath = path.join(TMP_DIR, newName);

  return zipFolder(fsPath, tmpPath)
    .then(pAddComicArchive,
  // handle errors
    function(err) {
      // delete tmp files and folders
      // we are checking they exist because it depends on when the error was fired
      if (exists(tmpPath)) {
        removeFiles(tmpPath);
      }
      sendMessage('error', { message: err.message });
    });
};


/**
 * Import comic from local archive
 * @param {string} archive - Filesystem path of the archive
 */
var pAddComicArchive = function(archive) {
  var tmpName = path.basename(archive, projectExt);
  var tmpPath = path.join(TMP_DIR, tmpName);
  var checksum;
  var comicJson;
  var slug;
  var fsPath;

  // checksum file
  return checksumFile(archive)
  // unzip file in tmp dir
    .then(function(res) {
      checksum = res;
      return unzipFile(archive, tmpPath);
    })
  // delete tmp archive
    .then(function() {
      return removeFiles(archive);
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
      return moveFolder(tmpPath, fsPath);
    })
  // add entry
    .then(function() {
      var entry = addEntry(comicJson, fsPath);
      projects[entry.id] = entry.o;
      // tell to load data in UI page
      sendMessage('load-item', { id: entry.id });
    },
  // handle errors
    function(err) {
      // delete tmp files and folders
      // we are checking they exist because it depends on when the error was fired
      if (exists(archive)) {
        removeFiles(archive);
      }
      if (exists(tmpPath)) {
        removeFiles(tmpPath);
      }
      sendMessage('error', { message: err.message });
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
    pAddComicFolder(msg.path);
  }

  if (msg.type === 'local-archive') {
    pAddComicArchive(msg.path);
  }

  if (msg.type === 'url') {
    pAddComicUrl(msg.url);
  }

  if (msg.type === 'open-int') {
    openInt(msg.id);
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
  loadIntComics();
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
