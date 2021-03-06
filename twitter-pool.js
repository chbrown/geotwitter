/*jslint node: true */
var events = require('events');
var logger = require('loge');
var request = require('request');
var util = require('util');
var tweet = require('twilight/tweet');

var TwitterPool = module.exports = function() {
  events.EventEmitter.call(this);

  this.accounts = [];
  this.responses = [];
  // this.streams = [];
};
util.inherits(TwitterPool, events.EventEmitter);
TwitterPool.prototype.getOAuth = function() {
  // just pick out a random account
  var account = this.accounts[Math.random() * this.accounts.length | 0];
  return {
    consumer_key: account.consumer_key,
    consumer_secret: account.consumer_secret,
    token: account.access_token,
    token_secret: account.access_token_secret,
  };
};

TwitterPool.prototype.add = function(form, callback) {
  // callback signature: function(err, response)
  // response also added to this.responses if it succeeds
  var self = this;
  var url = 'https://stream.twitter.com/1.1/statuses/filter.json';
  var req = request.post(url, {form: form, oauth: this.getOAuth()});
  req.form = form;

  req.on('response', function(res) {
    if (res.statusCode == 200) {
      self.responses.push(res);
      // self.streams.push(res);

      var tweet_stream = res.pipe(new tweet.JSONStoTweet())
      .on('data', function(tweet) {
        self.emit('data', tweet);
      })
      .on('error', function(err) {
        logger.error(err);
      });

      callback(null, res);
    }
    else {
      callback(res.statusCode, res);
    }
  });
};

TwitterPool.prototype.addPersistent = function(form, attempt, callback) {
  if (callback === undefined) callback = function() {};
  var self = this;
  this.add(form, function(err, res) {
    if (err && attempt < 5) {
      logger.error('TwitterPool.addPersistent failed, retrying in 2s. #' + attempt, {error: err});
      setTimeout(function() {
        self.addPersistent(form, attempt + 1, callback);
      }, 2000);
    }
    else if (err) {
      var message = 'TwitterPool.addPersistent failed too many times';
      logger.error(message);
      callback(new Error(message));
    }
    else {
      callback(null, res);
    }
  });
};

TwitterPool.prototype.removeAll = function() {
  this.responses.forEach(function(res) {
    res.request.abort();
  });
  this.responses = [];
};
