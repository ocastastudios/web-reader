var express = require('express');
var app = express();
var http = require('http');
var path = require('path');
var handlebars = require('./handlebars');

var Server = function(options) {
  // handlebars
  app.set('views', path.join(process.cwd(), 'views'));
  app.engine(handlebars.ext, handlebars.hbs.engine);
  app.set('view engine', handlebars.ext);

  // assets
  app.use(express.static(path.join(process.cwd(), 'public')));
  app.use('/vendor/director', express.static(path.join(process.cwd(), 'node_modules', 'director', 'build')));

  // check if server is already running
  http.get(options, function() {
    // server is already running
  }).on('error', function() {
    //server is not yet running
    http.createServer(app).listen(options.port);
  });

  return app;
};

module.exports = Server;