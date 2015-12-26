var path = require('path');
var osenv = require('osenv');

var settings = {
  host: '127.0.0.1',
  port: 8124,
  dir: 'Electricomics Library',
  ext: '.elcx',
  storeUrl: 'http://localhost:8000',
  TMP_DIR: osenv.tmpdir(),
  homepageUrl: '/index',
  homepageView: 'app',
  title: 'Electricomics'
};
settings.LIB_DIR = path.join(osenv.home(), settings.dir);
settings.serverUrl = 'http://' + settings.host + ':' + settings.port;

module.exports = settings;