/*global $, Handlebars, Router */

var sendMessage = function(type, obj) {
  var msg = {
    type: type
  };
  $.extend(msg, obj);
  window.parent.postMessage(JSON.stringify(msg), '*');
};

var receiveMessage = function(msg) {
  if (msg.type === 'error') {
    dialogError(msg.message);
  }
  if (msg.type === 'online') {
    $('#online').toggleClass('online', msg.status);
  }
};

var dialogError = function(msg) {
  var confirm = $('#dialog-error').dialog({
    resizable: false,
    modal: true,
    width: 550,
    buttons: {
      'Close': function() {
        $(this).dialog('close');
      }
    }
  });
  confirm.html('<p>' + msg + '</p>');
  confirm.dialog('open');
};



Handlebars.registerHelper('eq', function(a, b, options) {
  return a === b ? options.fn(this) : options.inverse(this);
});

Handlebars.registerHelper('breaklines', function(text) {
  text = Handlebars.Utils.escapeExpression(text);
  text = text.replace(/(\r\n|\n|\r)/gm, '<br>');
  return new Handlebars.SafeString(text);
});

var util = {
  store: function(namespace, data) {
    if (arguments.length > 1) {
      window[namespace] = data;
    } else {
      var store = window[namespace];
      return store || {};
    }
  }
};

var App = {
  init: function() {
    this.library = util.store('projects');
    this.store = util.store('projects');
    this.added = util.store('projects');
    this.sections = $('.section');
    this.navs = $('.main-nav__link');
    this.libraryListTemplate = Handlebars.compile($('#library__list--template').html());
    this.libraryItemTemplate = Handlebars.compile($('#library-item__wrapper--template').html());
    this.storeListTemplate = Handlebars.compile($('#store__list--template').html());
    this.storeItemTemplate = Handlebars.compile($('#store-item__wrapper--template').html());
    this.addedTemplate = Handlebars.compile($('#added--template').html());
    // this.render();
    // this.bindEvents();

    new Router({
      '/:section': function (section) {
        this.section = section;
        this.showSection();
      }.bind(this)
    }).init('/store');
    
    new Router({
      '/:section/:item': function (section, item) {
        if (section === 'store') {
          this.renderStoreItem(item);
        }
        if (section === 'library') {
          this.renderLibraryItem(item);
        }
      }.bind(this)
    }).init();
  },
  bindEvents: function() {
    
  },
  render: function() {
    this.renderLibraryList();
    this.renderStoreList();
    this.renderAdded();
  },
  showSection: function() {
    this.sections.hide()
      .filter('#' + this.section).show();
    this.navs.toggleClass('main-nav__link--selected', false)
      .filter('[href="#/' + this.section + '"]').toggleClass('main-nav__link--selected', true);
  },
  renderLibraryList: function() {
    $('#library__list').html(this.libraryListTemplate({library: this.library}));
  },
  renderLibraryItem: function(item) {
    $('#library-item__wrapper').html(this.libraryItemTemplate({library: this.library[item], features: features}));
    this.sections.hide();
    $('#library-item').show();
  },
  renderStoreList: function() {
    $('#store__list').html(this.storeListTemplate({store: this.store}));
  },
  renderStoreItem: function(item) {
    $('#store-item__wrapper').html(this.storeItemTemplate({store: this.store[item], features: features}));
    this.sections.hide();
    $('#store-item').show();
  },
  renderAdded: function() {
    $('#added').html(this.addedTemplate({library: this.added}));
  }
};

App.init();
