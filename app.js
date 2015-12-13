var nwgui = require('nw.gui');
var win = nwgui.Window.get();
var express = require('express');
var app = express();
var http = require('http');
var path = require('path');
var fs = require('fs-extra');
var Download = require('download');
var connectInject = require('connect-inject');
var osenv = require('osenv');
var Q = require('q');
var junk = require('junk');
var _ = require('underscore');
var tools = require('./lib/tools');
var Store = require('./lib/store');
var handlebars = require('./lib/handlebars');
var Communication = require('./lib/communication');
var ui = require('./lib/ui');

var DEBUG = true;

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

var serverUrl = 'http://' + options.host + ':' + options.port;
var projects = {};
var projectsList = [];
var projectExt = options.ext;
var comicSnippet = '<ec-webreader-nav style="display:block;position:absolute;background:red;top:0;z-index:1;"><a href="/index">HOME</a></ec-webreader-nav>';
var promisesLoadComics = [];
var downloadStream;
var downloadStreamInterrupted = false;
var store;

var sendMessage = new Communication(ui.iframe, serverUrl);


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
    app.engine(handlebars.ext, handlebars.hbs.engine);
    app.set('view engine', handlebars.ext);

    // assets
    app.use(express.static(path.join(process.cwd(), 'public')));
    app.use('/vendor/director', express.static(path.join(process.cwd(), 'node_modules', 'director', 'build')));
    app.use('/vendor/handlebars', express.static(path.join(process.cwd(), 'node_modules', 'express-handlebars', 'node_modules', 'handlebars', 'dist')));
    
    // app
    app.use('/index', function(req, res) {
      var internal = tools.isInternal(req);
      res.render('app', {
        library: projects,
        libraryList: projectsList,
        store: store.data,
        added: [],
        hbsHelpers: handlebars.helpersFE,
        internal: true
      });
    });
    // ajax item
    // app.use('/item', function(req, res) {
    //   var id = req.query.id;
    //   var library = {};
    //   library[id] = projects[id];
    //   var internal = tools.isInternal(req);
    //   res.render('item', {
    //     layout: false,
    //     library: library,
    //     internal: internal
    //   });
    // });

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
      return addEntry(res, fsPath);
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
  var cover = false;

  if (tools.exists(path.join(fsPath, 'cover.png'))) {
    cover = true;
  }
  
  var obj = {
    fsPath: fsPath,
    serverPath: serverPath,
    name: id,
    cover: cover,
    data: comicData
  };
  projects[id] = obj;
  projectsList.push(id);
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
      projectsList.splice(projectsList.indexOf(id), 1);
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
      slug = '' + checksum;
      fsPath = path.join(LIB_DIR, slug);
      return tools.moveFolder(tmpPath, fsPath);
    })
  // add entry
    .then(function() {
      var entry = addEntry(comicJson, fsPath);
      // tell to load data in UI page
      sendMessage('import', { message: 'completed' });
      sendMessage('add-item', { id: entry.id, data: entry.o });
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

  if (msg.type === 'close') {
    // close without asking
    win.hide();
    win.close(true);
  }

  if (msg.type === 'start') {
    ui.start();
  }
}, false);


// use the close event to catch every type of closing
win.on('close', function() {
  sendMessage('ask-to-close');
});


/**
 * Start and show
 */
var init = function() {
  store = new Store(options.storeUrl);
  loadExtComics();
  return Q.all(promisesLoadComics)
    .then(function() {
      ui.load(serverUrl + '/index');
    });
};


serverStart();
