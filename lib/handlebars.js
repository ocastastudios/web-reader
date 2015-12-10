var fs = require('fs-extra');
var path = require('path');
var _ = require('underscore');
var exphbs = require('express-handlebars');

var handlebars = {};
module.exports = handlebars;


handlebars.ext = '.hbs';


handlebars.helpers = {
  common: {
    breaklines: function(text) {
      text = Handlebars.Utils.escapeExpression(text);
      text = text.replace(/(\r\n|\n|\r)/gm, '<br>');
      return new Handlebars.SafeString(text);
    },
    eq: function(a, b, options) {
      return a === b ? options.fn(this) : options.inverse(this);
    },
    isValueInArray: function(array, value) {
      var index = array.indexOf(value);
      if (index === -1) {
        return false;
      }
      return true;
    }
  },
  backend: {
    rawpartial: function(partialName) {
      var file = path.join(process.cwd(), handlebars.hbs.partialsDir, partialName + handlebars.hbs.extname);
      var template = fs.readFileSync(file, 'utf8');
      return template;
    },
    json: function(context) {
      return JSON.stringify(context);
    }
  }
};


handlebars.hbs = exphbs.create({
  extname: handlebars.ext,
  helpers: _.extend({}, handlebars.helpers.common, handlebars.helpers.backend)
});
var Handlebars = handlebars.hbs.handlebars;