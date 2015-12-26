var path = require('path');
var osenv = require('osenv');
var webreader = require('./package.json');
var Server = require('./lib/server');
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
var serverUrl = 'http://' + options.host + ':' + options.port;
var comicSnippet = '<ec-webreader-nav title="Home"></ec-webreader-nav>';
var store;

var ui = new Ui({
  window: window
});
var chrome = new Chrome({
  title: 'Electricomics',
  debug: DEBUG
});
var app = new Server({
  host: options.host,
  port: options.port
});
var communication = new Communication({
  iframeWin: ui.iframe,
  serverUrl: serverUrl,
  window: window
});
var sendMessage = communication.sendMessage;
var comic = new Comic({
  TMP_DIR: TMP_DIR,
  LIB_DIR: LIB_DIR,
  projectExt: options.ext,
  sendMessage: sendMessage,
  app: app,
  comicSnippet: comicSnippet
});

// webpage of the app
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


// Listener for the messages from the app
var executeMessage = function(msg) {
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
};
communication.receiveMessage(executeMessage);


/**
 * Start and show
 */
var init = function() {
  store = new Store(options.storeUrl);
  return comic.loadComics()
    .then(function() {
      ui.load(serverUrl + '/index');
    });
};


init();