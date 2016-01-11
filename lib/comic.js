var express = require('express');
var path = require('path');
var fs = require('fs-extra');
var Download = require('download');
var Q = require('q');
var connectInject = require('connect-inject');
var junk = require('junk');
var tools = require('./tools');

module.exports = Comic;


function Comic(opts) {
  var that = this;

  var TMP_DIR = opts.TMP_DIR;
  var LIB_DIR = opts.LIB_DIR;
  var projectExt = opts.projectExt;
  var sendMessage = opts.sendMessage;
  var sendError = function(err) {
    console.log(err);
    sendMessage('error', { message: err.message + '\n' + err.stack });
  };
  var app = opts.app;
  var comicSnippet = '<ec-webreader-nav title="Home"></ec-webreader-nav>';

  var projects = {};
  var projectsList = [];
  var downloadStreamInterrupted = false;
  this.projects = projects;
  this.projectsList = projectsList;


  /**
   * Sort comics by key, it actually changed the array
   * @param {string} key - Parameter to sort to - optional, if not given, title will be used
   */
  this.sortComics = function(key) {
    key = key || 'title';
    projectsList.sort(function(a, b) {
      return compareComics(projects[a], projects[b], key);
    });
  };


  /**
   * Compare array items by key - this is used by the native Array.sort()
   * @param {string} key - Property to use for comparison
   */
  var compareComics = function(a, b, key) {
    if (a.data[key] < b.data[key]) {
      return -1;
    }
    if (a.data[key] > b.data[key]) {
      return 1;
    }
    return 0;
  };


  /**
   * Load all external comics
   */
  this.loadExtComics = function() {
    var comicsPath = LIB_DIR;
    var promisesLoadComics = [];

    if (!tools.exists(comicsPath)) {
      return false;
    }
    
    var comicsDir = fs.readdirSync(comicsPath);
    comicsDir = comicsDir.filter(junk.not);
    var fsPath;

    for (var i = 0; i < comicsDir.length; i++) {
      fsPath = path.join(comicsPath, comicsDir[i]);
      promisesLoadComics.push(that.readComicFolder(fsPath));
    }
    return Q.all(promisesLoadComics);
  };


  /**
   * Load all comics and sort them
   */
  this.loadComics = function() {
    return that.loadExtComics()
      .then(function() {
        that.sortComics();
      });
  };


  /**
   * Read comic from folder
   * @param {string} fsPath - Filesystem path of the folder
   */
  this.readComicFolder = function(fsPath) {
    return that.readComicJson(fsPath)
      .then(function(res) {
        return that.addEntry(res, fsPath);
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
  this.addEntry = function(comicData, fsPath) {
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
    app.get(serverPath + '/', that.persConnectInject);
    app.use(serverPath, express.static(fsPath));
    return { id: id, o: obj };
  };


  /**
   * Personalized version of connectInject
   */
  this.persConnectInject = function(req, res, next) {
    var originalUrl = req.originalUrl.replace(/\//ig, '');
    var entry = that.projects[originalUrl];
    if (!entry) {
      return next();
    }
    // var internal = tools.isInternal(req);
    var adapt = '<script>var elcxAdapt = false;</script>';
    if (!entry.data.generatorVersion || entry.data.generatorVersion < 1) {
      adapt = '<script>var elcxAdapt = true;</script>';
    }

    var snip = comicSnippet +  adapt + '<script src="/js/comic.js"></script><link rel="stylesheet" href="/css/comic.css">';
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
  this.downloadFile = function(url, dest, newName) {
    var deferred = Q.defer();
    new Download().get(url).dest(dest).rename(newName).use(that.downloadStatus).run(function(err, files) {
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
  this.readComicJson = function(fsPath) {
    var file = path.join(fsPath, 'comic.json');
    return tools.readJson(file);
  };


  /**
   * Parse comic.json
   * Sometimes the json is strictly valid but invalid for us
   * @param {any} value - Value to check
   */
  this.parseComicJson = function(value) {
    var deferred = Q.defer();
    if (typeof value !== 'object') {
      try {
        var obj = JSON.parse(value);
        deferred.resolve(obj);
      }
      catch (err) {
        deferred.reject(err);
      }
    }
    else {
      deferred.resolve(value);
    }
    return deferred.promise;
  };


  /**
   * Progress of the download
   * @param {object} res - response data
   * @param {string} url - url we are downloading from
   * @param {function} cb - Callback when download is completed
   */
  this.downloadStatus = function(res, url, cb) {
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
    that.downloadStream = res;
  };


  /**
   * Remove entry and its files from the library
   * @param {string} id - comic id
   */
  this.removeEntry = function(id) {
    if (!projects[id]) {
      var err = new Error('Project <code>' + id + '</code> not found');
      sendError(err);
      // sendMessage('error', { message: err.message });
      return false;
    }
    var fsPath = projects[id].fsPath;

    return tools.removeFiles(fsPath)
      .then(function() {
        delete projects[id];
        projectsList.splice(projectsList.indexOf(id), 1);
        sendMessage('deleted', { id: id });
      }, function(err) {
        sendError(err);
        // sendMessage('error', { message: err.message });
      });
  };


  /**
   * Import comic from url
   * @param {string} url - URL to download
   */
  this.pAddComicUrl = function(url) {
    var myUrl = tools.addhttp(url);
    var tmpName = Date.now() + '';
    var newName = tmpName + projectExt;
    var archive = path.join(TMP_DIR, newName);

    sendMessage('import', { message: 'started' });

    return that.downloadFile(myUrl, TMP_DIR, newName)
      .then(that.pAddComicArchive,
    // handle errors
      function(err) {
        // delete tmp files and folders
        // we are checking they exist because it depends on when the error was fired
        if (tools.exists(archive)) {
          tools.removeFiles(archive);
        }
        sendError(err);
        // sendMessage('error', { message: err.message });
        sendMessage('import', { message: 'error' });
      });
  };


  /**
   * Import comic from local folder
   * @param {string} fsPath - Filesystem path of the folder
   */
  this.pAddComicFolder = function(fsPath) {
    var tmpName = Date.now() + '';
    var newName = tmpName + projectExt;
    var tmpPath = path.join(TMP_DIR, newName);

    sendMessage('import', { message: 'started' });

    return tools.zipFolder(fsPath, tmpPath)
      .then(that.pAddComicArchive,
    // handle errors
      function(err) {
        // delete tmp files and folders
        // we are checking they exist because it depends on when the error was fired
        if (tools.exists(tmpPath)) {
          tools.removeFiles(tmpPath);
        }
        sendError(err);
        // sendMessage('error', { message: err.message });
        sendMessage('import', { message: 'error' });
      });
  };


  /**
   * Import comic from local archive - for the UI
   * @param {string} archive - Filesystem path of the archive
   */
  this.pAddComicElcx = function(archive) {
    var tmpName = Date.now() + '';
    var newName = tmpName + projectExt;
    var tmpPath = path.join(TMP_DIR, newName);

    sendMessage('import', { message: 'started' });

    return tools.copyFs(archive, tmpPath)
      .then(that.pAddComicArchive,
    // handle errors
      function(err) {
        // delete tmp files and folders
        // we are checking they exist because it depends on when the error was fired
        if (tools.exists(tmpPath)) {
          tools.removeFiles(tmpPath);
        }
        sendError(err);
        // sendMessage('error', { message: err.message });
        sendMessage('import', { message: 'error' });
      });
  };


  /**
   * Import comic from archive
   * @param {string} archive - Filesystem path of the archive
   */
  this.pAddComicArchive = function(archive) {
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
        return that.readComicJson(tmpPath);
      })
    // parse comic.json in case of errors
      .then(function(res) {
        return that.parseComicJson(res);
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
        var entry = that.addEntry(comicJson, fsPath);
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
        sendError(err);
        // sendMessage('error', { message: err.message });
        sendMessage('import', { message: 'error' });
      });
  };
}