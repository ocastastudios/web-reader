var fs = require('fs-extra');
var path = require('path');
var Q = require('q');
var moment = require('moment');
var url = require('url');
var _ = require('underscore');
var tools = require('./tools');

module.exports = Store;

function Store(remoteUrl) {
  var STORE_DIR = path.join(process.cwd(), 'public', 'store');
  var TMP_DIR = path.join(process.cwd(), 'tmp_store');
  var JSON_FILE = 'comics.json';
  var STORE_FILE = path.join(STORE_DIR, JSON_FILE);
  var URL_FILE = url.resolve(remoteUrl, JSON_FILE);
  var promisesLoadCovers = [];
  var that = this;

  this.data = {
    library: {},
    libraryList: []
  };


  /**
   * Save cover image
   * @param {string} cover - file name with extension
   */
  var importSingleCover = function(cover) {
    if (!tools.exists( path.join(STORE_DIR, cover) )) {
      // download it
      return tools.downloadFile(url.resolve(remoteUrl, cover), TMP_DIR);
    }
    else {
      // copy it
      return tools.copyFs( path.join(STORE_DIR, cover), path.join(TMP_DIR, cover) );
    }
  };


  /**
   * Save all cover images
   * @param {object} list - List of entries
   */
  var importAllCovers = function(list) {
    for (var i in list) {
      if (list.hasOwnProperty(i)) {
        if (list[i].cover) {
          promisesLoadCovers.push(importSingleCover( list[i].cover ));
        }
      }
    }
  };


  /**
   * Compare date of the downloaded data with the date of the stored data
   * The function returns a promise so we can end the download chaining
   * @param {string} downloadedDate - Date of the downloaded data
   * @returns {promise} True if date is newer, error if not
   */
  var isNew = function(downloadedDate) {
    var deferred = Q.defer();
    if (that.lastUpdate == null) {
      that.lastUpdate = 0;
    }
    var st = moment(that.lastUpdate);
    var dl = moment(downloadedDate);
    var diff = dl.diff(st);
    if (diff > 0) {
      deferred.resolve(true);
    }
    else {
      deferred.reject(new Error('The data downloaded is not new'));
    }
    return deferred.promise;
  };


  /**
   * Import data into our structure
   * @param {object} obj - JSON object to read
   * @returns {object} formatted JSON object
   */
  var formatData = function(obj) {
    var libraryList = [];
    if (obj.library) {
      _.each(obj.library, function(value) {
        libraryList.push(value.id);
      });
      obj.libraryList = libraryList;
    }
    return obj;
  };


  /**
   * Load store data
   * @returns {object} JSON object
   */
  this.get = function() {
    // throws option set to false and it won't throw if the JSON is invalid
    if (tools.exists(STORE_FILE)) {
      var comicsJson = fs.readJSONSync(STORE_FILE, {throws: false}) || {};
      that.data = formatData(comicsJson);
    }
  };


  /**
   * Download and load online store
   */
  this.download = function() {
    var comicsJson;

    return tools.downloadFile(URL_FILE, TMP_DIR, JSON_FILE)
    // read downloaded json file
      .then(tools.readJson)
    // save downloaded json data
      .then(function(res) {
        comicsJson = res;
        return comicsJson.lastUpdate;
      })
    // check the downloaded data is newer that what we already have
      .then(function(res) {
        return isNew(res);
      })
    // import covers
      .then(function() {
        importAllCovers(comicsJson.library);
        return Q.all(promisesLoadCovers);
      })
    // move tmp to store
      .then(function() {
        return tools.moveFolder(TMP_DIR, STORE_DIR, true);
      })
    // save the new data
      .then(function() {
        that.data = formatData(comicsJson);
        return comicsJson;
      },
    // handle errors
      function(err) {
        console.error(err);
        // delete tmp folder
        // we are checking they exist because it depends on when the error was fired
        if (tools.exists(TMP_DIR)) {
          tools.removeFiles(TMP_DIR);
        }
      });
  };

  this.get();
}