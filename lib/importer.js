var fs = require('fs-extra');
var path = require('path');
var Q = require('q');
var moment = require('moment');
var tools = require('./tools');

var LIB_DIR = path.join(process.cwd(), 'public', 'store');
var TMP_DIR = LIB_DIR;
var PROJECT_EXT = '.elcx';
var COVER_EXT = '.png';
var COVER = 'cover' + COVER_EXT;
var COMIC_JSON = 'comic.json';
var LIBRARY_JSON = 'comics.json';
var library = [];
var promisesLoadComics = [];
var counter = 0;

var list = [
  'https://www.dropbox.com/s/e17gfrv6g2x7502/big-nemo.elcx?dl=1',
  'https://www.dropbox.com/s/l9x5t1m3xhakw6n/red-horse.elcx?dl=1',
  'https://www.dropbox.com/s/0x8v21wk6cwm0fm/second-sight.elcx?dl=1',
  'https://www.dropbox.com/s/0sl2n8djfwxv3ht/sway.elcx?dl=1',
  'http://j.mp/elcx-hammer',
  'http://j.mp/elcx-mirror',
  'http://www.larsschwednygard.com/wp-content/uploads/birds_of_twilight_park.elcxproject.elcx',
  'http://j.mp/elcx-traume',
  'http://j.mp/elcx-thisman',
  'http://j.mp/elcx-samurai',
  'http://j.mp/elcx-thearcane',
  'http://j.mp/elcx-eagleno4',
  'http://biblicalcomix.com/Pureblood.elcx',
  'http://biblicalcomix.com/Babel.elcxproject.elcx',
  'https://dl.dropboxusercontent.com/s/lr5up35ekkte7vc/A.elcx',
  'http://dave.sunwheeltech.com/electricomics/sleep_well/sleep_well.elcxproject.elcx',
  'https://dl.dropboxusercontent.com/u/15028274/frankenstein_for_kids.elcx',
  'https://www.dropbox.com/s/t85rs71o2bry89r/Monster.elcxproject.elcx?dl=1',
  'https://j.mp/elcx-hello',
  'https://www.dropbox.com/s/j88t208w6d7rnev/thornwand.elcxproject.elcx?dl=1',
  'http://j.mp/elcx-stoners101',
  'http://biblicalcomix.com/Stoners102.elcx',
  'http://j.mp/elcx-whenold',
  'http://j.mp/elcx-sfumato'
];


/**
 * Compare array items by key - this is used by the native Array.sort()
 * @param {string} key - Property to use for comparison
 */
var compareLibrary = function(a, b, key) {
  if (a.data[key] < b.data[key]) {
    return -1;
  }
  if (a.data[key] > b.data[key]) {
    return 1;
  }
  return 0;
};


/**
 * Sort library by key, it actually changes the array
 * @param {string} key - Parameter to sort to
 */
var sortLibrary = function(key) {
  library.sort(function(a, b) {
    return compareLibrary(a, b, key);
  });
};


/**
 * Copy cover image
 * @param {string} source - Filesystem path of the file to copy
 * @param {string} dest - Filesystem path and name of the new file
 * @returns {string/boolean} Filesystem path and name of the new file or false if not found
 */
var copyCover = function(source, dest) {
  var deferred = Q.defer();
  fs.copy(source, dest, function(err) {
    if (err) {
      deferred.resolve(false);
    }
    else {
      deferred.resolve(dest);
    }
  });
  return deferred.promise;
};


/**
 * @param {string} url - URL to import
 */
var importSingleUrl = function(url) {
  counter++;
  var myUrl = tools.addhttp(url);
  var tmpName = counter + '' + Date.now();
  var newName = tmpName + PROJECT_EXT;
  var archive = path.join(TMP_DIR, newName);
  var tmpPath = path.join(TMP_DIR, tmpName);
  var tmpCoverPath = path.join(tmpPath, COVER);
  var checksum;
  var checksumCover;
  var comicJson;
  var ourCover;

  // download archive
  return tools.downloadFile(myUrl, TMP_DIR, newName)
  // checksum archive
    .then(tools.checksumFile)
  // unzip archive in tmp dir
    .then(function(res) {
      checksum = res;
      return tools.unzipFile(archive, tmpPath);
    })
  // delete archive
    .then(function() {
      return tools.removeFiles(archive);
    })
  // checksum cover
    .then(function() {
      if (tools.exists(tmpCoverPath)) {
        return tools.checksumFile(tmpCoverPath);
      }
      else {
        return checksum;
      }
    })
  // copy cover
    .then(function(res) {
      checksumCover = res;
      var ourCoverPath = path.join(LIB_DIR, checksumCover + COVER_EXT);
      return copyCover(tmpCoverPath, ourCoverPath);
    })
  // read comic.json
    .then(function(res) {
      ourCover = res;
      return tools.readJson(path.join(tmpPath, COMIC_JSON));
    })
  // delete tmp dir
    .then(function(res) {
      comicJson = res;
      return tools.removeFiles(tmpPath);
    })
  // add entry
    .then(function() {
      var c = checksumCover + COVER_EXT;
      if (ourCover === false) {
        c = false;
      }
      var o = {
        cover: c,
        id: checksum,
        url: myUrl
      };
      o.data = comicJson;
      library.push(o);
      return checksum;
    },
  // handle errors
    function(err) {
      console.error(url, err);
      // delete tmp archive and folder
      // we are checking they exist because it depends on when the error was fired
      if (tools.exists(archive)) {
        tools.removeFiles(archive);
      }
      if (tools.exists(tmpPath)) {
        tools.removeFiles(tmpPath);
      }
      if (tools.exists(ourCover)) {
        tools.removeFiles(ourCover);
      }
    });
};


/**
 * @param {array} list - List of url string
 */
var importAllUrl = function(list) {
  for (var i = 0; i < list.length; i++) {
    promisesLoadComics.push(importSingleUrl( list[i] ));
  }
};


/**
 * @param {array} list - List of url string
 */
var init = function(list) {
  var jsonFile = path.join(LIB_DIR, LIBRARY_JSON);
  var created = moment().format();
  var obj = {
    lastUpdate: created,
    library: library
  };
  importAllUrl(list);
  return Q.all(promisesLoadComics)
    .then(function() {
      var str;
      sortLibrary('title');
      try {
        str = JSON.stringify(library);
        fs.writeJSONSync(jsonFile, obj);
      }
      catch(err) {
        console.log(err);
      }
    },
  // handle errors
    function(err) {
      console.error(err);
    });
};


init(list);