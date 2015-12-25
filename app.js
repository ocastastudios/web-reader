var express = require('express');
var app = express();
var http = require('http');
var path = require('path');
var osenv = require('osenv');
var Q = require('q');
var webreader = require('./package.json');
var tools = require('./lib/tools');
var Store = require('./lib/store');
var handlebars = require('./lib/handlebars');
var Communication = require('./lib/communication');
var Ui = require('./lib/ui');
var Comic = require('./lib/comic');
var Chrome = require('./lib/chrome');

var DEBUG = true;

// settings
// they may end up in the advanced setting panel
var options = {
  host: '127.0.0.1',
  port: 8124,
  dir: 'Electricomics Library',
  ext: '.elcx',
  storeUrl: 'http://localhost:8000'
};

var HOME_DIR = osenv.home();
var TMP_DIR = osenv.tmpdir();
var LIB_DIR = path.join(HOME_DIR, options.dir);
if (DEBUG) {
  TMP_DIR = path.join(HOME_DIR, 'Desktop');
}

// server stuff
var server;
var sockets = {};
var nextSocketId = 0;

var ui = new Ui({
  window: window
});
var chrome = new Chrome({
  title: 'Electricomics',
  debug: DEBUG
});
var serverUrl = 'http://' + options.host + ':' + options.port;
var comicSnippet = '<ec-webreader-nav title="Home"></ec-webreader-nav>';
var store;

var sendMessage = new Communication(ui.iframe, serverUrl);
var comic = new Comic({
  TMP_DIR: TMP_DIR,
  LIB_DIR: LIB_DIR,
  projectExt: options.ext,
  sendMessage: sendMessage,
  app: app,
  comicSnippet: comicSnippet
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
    app.engine(handlebars.ext, handlebars.hbs.engine);
    app.set('view engine', handlebars.ext);

    // assets
    app.use(express.static(path.join(process.cwd(), 'public')));
    app.use('/vendor/director', express.static(path.join(process.cwd(), 'node_modules', 'director', 'build')));
    
    // app
    app.use('/index', function(req, res) {
      var internal = tools.isInternal(req);
      res.render('app', {
        library: comic.projects,
        libraryList: comic.projectsList,
        store: store.data,
        added: [],
        hbsHelpers: handlebars.helpersFE,
        version: webreader.version,
        internal: true
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

  if (msg.type === 'local-archive') {
    comic.pAddComicElcx(msg.path);
  }

  if (msg.type === 'url') {
    comic.pAddComicUrl(msg.url);
  }

  if (msg.type === 'remove-entry') {
    comic.removeEntry(msg.id);
  }

  if (msg.type === 'interrupt') {
    comic.downloadStream.emit('interrupt');
  }

  if (msg.type === 'online') {
    isOnline();
  }

  if (msg.type === 'open-link') {
    chrome.openLink(msg.url);
  }

  if (msg.type === 'start') {
    ui.start();
    chrome.contextmenuCreate(ui.iframe.document);
  }
}, false);


/**
 * Start and show
 */
var init = function() {
  store = new Store(options.storeUrl);
  var promisesArr = comic.loadExtComics();
  return Q.all(promisesArr)
    .then(function() {
      comic.sortComics();
      ui.load(serverUrl + '/index');
    });
};


serverStart();
