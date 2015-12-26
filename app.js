var webreader = require('./package.json');
var settings = require('./lib/settings');
var tools = require('./lib/tools');
var handlebars = require('./lib/handlebars');
var Server = require('./lib/server');
var Communication = require('./lib/communication');
var Ui = require('./lib/ui');
var Chrome = require('./lib/chrome');
var Store = require('./lib/store');
var Comic = require('./lib/comic');

var DEBUG = true;

var store;
var ui = new Ui({
  window: window
});
var chrome = new Chrome({
  title: settings.title,
  debug: DEBUG
});
var app = new Server({
  host: settings.host,
  port: settings.port
});
var communication = new Communication({
  iframeWin: ui.iframe,
  serverUrl: settings.serverUrl,
  window: window
});
var sendMessage = communication.sendMessage;
var comic = new Comic({
  TMP_DIR: settings.TMP_DIR,
  LIB_DIR: settings.LIB_DIR,
  projectExt: settings.ext,
  sendMessage: sendMessage,
  app: app
});

// webpage of the app
app.use(settings.homepageUrl, function(req, res) {
  var internal = tools.isInternal(req);
  res.render(settings.homepageView, {
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
  store = new Store(settings.storeUrl);
  return comic.loadComics()
    .then(function() {
      ui.load(settings.serverUrl + settings.homepageUrl);
    });
};


init();